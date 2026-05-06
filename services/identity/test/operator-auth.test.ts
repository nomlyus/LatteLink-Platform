import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { createInMemoryIdentityRepository } from "../src/repository.js";
import { provisionOwnerAccess } from "../src/provisioning.js";
import {
  internalOwnerInviteResponseSchema,
  internalOwnerProvisionResponseSchema,
  internalOwnerSummarySchema,
  operatorInviteAcceptResponseSchema,
  operatorInviteLookupResponseSchema
} from "@lattelink/contracts-auth";

const ownerEmail = "owner@gazellecoffee.com";
const ownerPassword = "LatteLinkOwner123!";
const storeEmail = "store@gazellecoffee.com";
const storePassword = "LatteLinkStore123!";
const locationId = "rawaqcoffee01";

async function signInOperator(
  app: Awaited<ReturnType<typeof buildApp>>,
  email: string,
  password: string,
  locationId?: string
) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/operator/auth/sign-in",
    payload: {
      email,
      password,
      locationId
    }
  });

  expect(response.statusCode).toBe(200);
  return response.json();
}

async function provisionOwner(repository: ReturnType<typeof createInMemoryIdentityRepository>) {
  return provisionOwnerAccess(repository, {
    allowInMemory: true,
    displayName: "Store Owner",
    email: ownerEmail,
    locationId,
    password: ownerPassword
  });
}

async function provisionStore(repository: ReturnType<typeof createInMemoryIdentityRepository>) {
  await repository.createOperatorUser({
    displayName: "Store Screen",
    email: storeEmail,
    role: "store",
    locationId,
    password: storePassword
  });
}

describe("operator auth", () => {
  const previousGatewayToken = process.env.GATEWAY_INTERNAL_API_TOKEN;
  const previousOperatorAbsoluteTtlDays = process.env.OPERATOR_SESSION_ABSOLUTE_TTL_DAYS;

  afterEach(() => {
    vi.useRealTimers();
    if (previousGatewayToken === undefined) {
      delete process.env.GATEWAY_INTERNAL_API_TOKEN;
    } else {
      process.env.GATEWAY_INTERNAL_API_TOKEN = previousGatewayToken;
    }
    if (previousOperatorAbsoluteTtlDays === undefined) {
      delete process.env.OPERATOR_SESSION_ABSOLUTE_TTL_DAYS;
    } else {
      process.env.OPERATOR_SESSION_ABSOLUTE_TTL_DAYS = previousOperatorAbsoluteTtlDays;
    }
  });

  it("supports refresh rotation and invalidates prior operator access tokens after logout", async () => {
    const repository = createInMemoryIdentityRepository();
    await provisionOwner(repository);
    const app = await buildApp({ repository });

    const session = await signInOperator(app, ownerEmail, ownerPassword);

    const me = await app.inject({
      method: "GET",
      url: "/v1/operator/auth/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`
      }
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      email: ownerEmail,
      role: "owner"
    });

    const refresh = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/refresh",
      payload: {
        refreshToken: session.refreshToken
      }
    });
    expect(refresh.statusCode).toBe(200);
    const rotatedSession = refresh.json();
    expect(rotatedSession.accessToken).not.toBe(session.accessToken);
    expect(rotatedSession.refreshToken).not.toBe(session.refreshToken);

    const oldSessionMe = await app.inject({
      method: "GET",
      url: "/v1/operator/auth/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`
      }
    });
    expect(oldSessionMe.statusCode).toBe(401);

    const refreshedMe = await app.inject({
      method: "GET",
      url: "/v1/operator/auth/me",
      headers: {
        authorization: `Bearer ${rotatedSession.accessToken}`
      }
    });
    expect(refreshedMe.statusCode).toBe(200);

    const logout = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/logout",
      payload: {
        refreshToken: rotatedSession.refreshToken
      }
    });
    expect(logout.statusCode).toBe(200);

    const postLogoutMe = await app.inject({
      method: "GET",
      url: "/v1/operator/auth/me",
      headers: {
        authorization: `Bearer ${rotatedSession.accessToken}`
      }
    });
    expect(postLogoutMe.statusCode).toBe(401);

    const invalidRefresh = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/refresh",
      payload: {
        refreshToken: rotatedSession.refreshToken
      }
    });
    expect(invalidRefresh.statusCode).toBe(401);
    expect(invalidRefresh.json()).toMatchObject({
      code: "INVALID_REFRESH_TOKEN"
    });

    await app.close();
  });

  it("rejects operator refresh after absolute session TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    process.env.OPERATOR_SESSION_ABSOLUTE_TTL_DAYS = "1";
    const repository = createInMemoryIdentityRepository();
    await provisionOwner(repository);
    const app = await buildApp({ repository });

    const session = await signInOperator(app, ownerEmail, ownerPassword);

    vi.setSystemTime(new Date("2030-01-02T00:00:01.000Z"));
    const refresh = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/refresh",
      payload: {
        refreshToken: session.refreshToken
      }
    });

    expect(refresh.statusCode).toBe(401);
    expect(refresh.json()).toMatchObject({
      code: "SESSION_EXPIRED",
      message: "Your session has expired. Please sign in again."
    });

    const retry = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/refresh",
      payload: {
        refreshToken: session.refreshToken
      }
    });
    expect(retry.statusCode).toBe(401);
    expect(retry.json()).toMatchObject({
      code: "INVALID_REFRESH_TOKEN"
    });

    await app.close();
  });

  it("honors requested operator location during password sign-in and refresh", async () => {
    const repository = createInMemoryIdentityRepository();
    await provisionOwner(repository);
    await provisionOwnerAccess(repository, {
      allowInMemory: true,
      displayName: "Store Owner",
      email: ownerEmail,
      locationId: "pilot-01",
      password: ownerPassword
    });
    const app = await buildApp({ repository });

    const session = await signInOperator(app, ownerEmail, ownerPassword, "pilot-01");
    expect(session.operator).toMatchObject({
      email: ownerEmail,
      locationId: "pilot-01",
      locationIds: expect.arrayContaining([locationId, "pilot-01"])
    });

    const me = await app.inject({
      method: "GET",
      url: "/v1/operator/auth/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`
      }
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      email: ownerEmail,
      locationId: "pilot-01"
    });

    const refresh = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/refresh",
      payload: {
        refreshToken: session.refreshToken
      }
    });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json()).toMatchObject({
      operator: {
        email: ownerEmail,
        locationId: "pilot-01"
      }
    });

    await app.close();
  });

  it("rejects requested operator locations outside the user's access set", async () => {
    const repository = createInMemoryIdentityRepository();
    await provisionOwner(repository);
    const app = await buildApp({ repository });

    const response = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/sign-in",
      payload: {
        email: ownerEmail,
        password: ownerPassword,
        locationId: "forbidden-01"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: "OPERATOR_LOCATION_FORBIDDEN"
    });

    await app.close();
  });

  it("lets expired operator access tokens recover through refresh", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));

    const repository = createInMemoryIdentityRepository();
    await provisionOwner(repository);
    const app = await buildApp({ repository });
    const session = await signInOperator(app, ownerEmail, ownerPassword);

    vi.setSystemTime(new Date("2030-01-01T00:31:00.000Z"));

    const expiredMe = await app.inject({
      method: "GET",
      url: "/v1/operator/auth/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`
      }
    });
    expect(expiredMe.statusCode).toBe(401);

    const refresh = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/refresh",
      payload: {
        refreshToken: session.refreshToken
      }
    });
    expect(refresh.statusCode).toBe(200);

    const refreshedSession = refresh.json();
    const refreshedMe = await app.inject({
      method: "GET",
      url: "/v1/operator/auth/me",
      headers: {
        authorization: `Bearer ${refreshedSession.accessToken}`
      }
    });
    expect(refreshedMe.statusCode).toBe(200);

    await app.close();
  });

  it("enforces owner-only team management boundaries", async () => {
    const repository = createInMemoryIdentityRepository();
    await provisionOwner(repository);
    await provisionStore(repository);
    const app = await buildApp({ repository });

    const ownerSession = await signInOperator(app, ownerEmail, ownerPassword);
    const storeSession = await signInOperator(app, storeEmail, storePassword);

    const ownerList = await app.inject({
      method: "GET",
      url: "/v1/operator/users",
      headers: {
        authorization: `Bearer ${ownerSession.accessToken}`
      }
    });
    expect(ownerList.statusCode).toBe(200);
    expect(ownerList.json().users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: ownerEmail, role: "owner" }),
        expect.objectContaining({ email: storeEmail, role: "store" })
      ])
    );

    const storeList = await app.inject({
      method: "GET",
      url: "/v1/operator/users",
      headers: {
        authorization: `Bearer ${storeSession.accessToken}`
      }
    });
    expect(storeList.statusCode).toBe(403);
    expect(storeList.json()).toMatchObject({
      code: "FORBIDDEN"
    });

    const ownerCreate = await app.inject({
      method: "POST",
      url: "/v1/operator/users",
      headers: {
        authorization: `Bearer ${ownerSession.accessToken}`
      },
      payload: {
        displayName: "Night Lead",
        email: "nightlead@gazellecoffee.com",
        role: "manager",
        password: "NightLead123!"
      }
    });
    expect(ownerCreate.statusCode).toBe(200);
    expect(ownerCreate.json()).toMatchObject({
      email: "nightlead@gazellecoffee.com",
      role: "manager",
      locationId: "rawaqcoffee01"
    });

    const duplicateCreate = await app.inject({
      method: "POST",
      url: "/v1/operator/users",
      headers: {
        authorization: `Bearer ${ownerSession.accessToken}`
      },
      payload: {
        displayName: "Duplicate Owner",
        email: "owner@gazellecoffee.com",
        role: "manager",
        password: "DuplicateOwner123!"
      }
    });
    expect(duplicateCreate.statusCode).toBe(409);
    expect(duplicateCreate.json()).toMatchObject({
      code: "OPERATOR_EMAIL_ALREADY_EXISTS"
    });

    const storeCreate = await app.inject({
      method: "POST",
      url: "/v1/operator/users",
      headers: {
        authorization: `Bearer ${storeSession.accessToken}`
      },
      payload: {
        displayName: "Blocked User",
        email: "blocked@gazellecoffee.com",
        role: "store",
        password: "BlockedUser123!"
      }
    });
    expect(storeCreate.statusCode).toBe(403);
    expect(storeCreate.json()).toMatchObject({
      code: "FORBIDDEN"
    });

    const selfDeactivate = await app.inject({
      method: "PATCH",
      url: `/v1/operator/users/${ownerSession.operator.operatorUserId}`,
      headers: {
        authorization: `Bearer ${ownerSession.accessToken}`
      },
      payload: {
        active: false
      }
    });
    expect(selfDeactivate.statusCode).toBe(400);
    expect(selfDeactivate.json()).toMatchObject({
      code: "INVALID_OPERATOR_UPDATE"
    });

    const conflictUpdate = await app.inject({
      method: "PATCH",
      url: `/v1/operator/users/${ownerCreate.json().operatorUserId as string}`,
      headers: {
        authorization: `Bearer ${ownerSession.accessToken}`
      },
      payload: {
        email: "owner@gazellecoffee.com"
      }
    });
    expect(conflictUpdate.statusCode).toBe(409);
    expect(conflictUpdate.json()).toMatchObject({
      code: "OPERATOR_EMAIL_ALREADY_EXISTS"
    });

    await app.close();
  });

  it("supports multi-location owner sessions and scoped team management", async () => {
    const repository = createInMemoryIdentityRepository();
    await provisionOwner(repository);
    await provisionOwnerAccess(repository, {
      allowInMemory: true,
      displayName: "Store Owner",
      email: ownerEmail,
      locationId: "pilot-01",
      password: ownerPassword
    });
    await repository.createOperatorUser({
      displayName: "Pilot Lead",
      email: "pilotlead@gazellecoffee.com",
      role: "manager",
      locationId: "pilot-01",
      password: "PilotLead123!"
    });
    const app = await buildApp({ repository });

    const ownerSession = await signInOperator(app, ownerEmail, ownerPassword);
    expect(ownerSession.operator.locationIds).toEqual(expect.arrayContaining([locationId, "pilot-01"]));

    const pilotList = await app.inject({
      method: "GET",
      url: "/v1/operator/users?locationId=pilot-01",
      headers: {
        authorization: `Bearer ${ownerSession.accessToken}`
      }
    });
    expect(pilotList.statusCode).toBe(200);
    expect(pilotList.json().users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: ownerEmail, locationId: "pilot-01" }),
        expect.objectContaining({ email: "pilotlead@gazellecoffee.com", locationId: "pilot-01" })
      ])
    );

    const pilotCreate = await app.inject({
      method: "POST",
      url: "/v1/operator/users?locationId=pilot-01",
      headers: {
        authorization: `Bearer ${ownerSession.accessToken}`
      },
      payload: {
        displayName: "Pilot Staff",
        email: "pilotstaff@gazellecoffee.com",
        role: "store",
        password: "PilotStaff123!"
      }
    });
    expect(pilotCreate.statusCode).toBe(200);
    expect(pilotCreate.json()).toMatchObject({
      email: "pilotstaff@gazellecoffee.com",
      locationId: "pilot-01"
    });

    const forbiddenLocation = await app.inject({
      method: "GET",
      url: "/v1/operator/users?locationId=unknown-01",
      headers: {
        authorization: `Bearer ${ownerSession.accessToken}`
      }
    });
    expect(forbiddenLocation.statusCode).toBe(403);
    expect(forbiddenLocation.json()).toMatchObject({
      code: "FORBIDDEN"
    });

    await app.close();
  });

  it("provisions a first owner through the gateway-protected internal route", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "identity-gateway-token";
    const repository = createInMemoryIdentityRepository();
    const app = await buildApp({ repository });

    const emptySummaryResponse = await app.inject({
      method: "GET",
      url: "/v1/identity/internal/locations/pilot-01/owner",
      headers: {
        "x-gateway-token": "identity-gateway-token"
      }
    });

    expect(emptySummaryResponse.statusCode).toBe(200);
    expect(internalOwnerSummarySchema.parse(emptySummaryResponse.json())).toEqual({
      locationId: "pilot-01",
      owner: null
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/internal/locations/pilot-01/owner/provision",
      headers: {
        "x-gateway-token": "identity-gateway-token"
      },
      payload: {
        displayName: "Pilot Owner",
        email: "pilot.owner@example.com"
      }
    });

    expect(response.statusCode).toBe(200);
    const parsed = internalOwnerProvisionResponseSchema.parse(response.json());
    expect(parsed.action).toBe("created");
    expect(parsed.operator.locationId).toBe("pilot-01");
    expect(parsed.operator.role).toBe("owner");

    const summaryResponse = await app.inject({
      method: "GET",
      url: "/v1/identity/internal/locations/pilot-01/owner",
      headers: {
        "x-gateway-token": "identity-gateway-token"
      }
    });

    expect(summaryResponse.statusCode).toBe(200);
    expect(internalOwnerSummarySchema.parse(summaryResponse.json())).toMatchObject({
      locationId: "pilot-01",
      owner: {
        email: "pilot.owner@example.com",
        role: "owner"
      }
    });

    await app.close();
  });

  it("updates the current location owner through the gateway-protected internal route", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "identity-gateway-token";
    const repository = createInMemoryIdentityRepository();
    const app = await buildApp({ repository });

    const initialResponse = await app.inject({
      method: "POST",
      url: "/v1/identity/internal/locations/pilot-01/owner/provision",
      headers: {
        "x-gateway-token": "identity-gateway-token"
      },
      payload: {
        displayName: "Pilot Owner",
        email: "pilot.owner@example.com"
      }
    });

    expect(initialResponse.statusCode).toBe(200);
    expect(internalOwnerProvisionResponseSchema.parse(initialResponse.json())).toMatchObject({
      action: "created",
      operator: {
        email: "pilot.owner@example.com",
        locationId: "pilot-01",
        role: "owner"
      }
    });

    const correctedResponse = await app.inject({
      method: "POST",
      url: "/v1/identity/internal/locations/pilot-01/owner/provision",
      headers: {
        "x-gateway-token": "identity-gateway-token"
      },
      payload: {
        displayName: "Pilot Owner",
        email: "pilot.corrected@example.com"
      }
    });

    expect(correctedResponse.statusCode).toBe(200);
    const corrected = internalOwnerProvisionResponseSchema.parse(correctedResponse.json());
    expect(corrected.action).toBe("updated");
    expect(corrected.operator.email).toBe("pilot.corrected@example.com");
    expect(corrected.operator.locationId).toBe("pilot-01");
    expect(corrected.operator.role).toBe("owner");

    const summaryResponse = await app.inject({
      method: "GET",
      url: "/v1/identity/internal/locations/pilot-01/owner",
      headers: {
        "x-gateway-token": "identity-gateway-token"
      }
    });

    expect(summaryResponse.statusCode).toBe(200);
    expect(internalOwnerSummarySchema.parse(summaryResponse.json())).toMatchObject({
      locationId: "pilot-01",
      owner: {
        email: "pilot.corrected@example.com",
        role: "owner"
      }
    });

    await app.close();
  });

  it("invites an owner through the gateway route and accepts the one-time link", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "identity-gateway-token";
    const repository = createInMemoryIdentityRepository();
    const app = await buildApp({ repository });

    const inviteResponse = await app.inject({
      method: "POST",
      url: "/v1/identity/internal/locations/pilot-01/owner/invite",
      headers: {
        "x-gateway-token": "identity-gateway-token"
      },
      payload: {
        displayName: "Pilot Owner",
        email: "pilot.owner@example.com",
        dashboardUrl: "https://client.example.com"
      }
    });

    expect(inviteResponse.statusCode).toBe(200);
    const invite = internalOwnerInviteResponseSchema.parse(inviteResponse.json());
    expect(invite.operator.active).toBe(false);
    expect(invite.invite.inviteUrl).toContain("/invites/");
    const token = invite.invite.inviteUrl!.split("/invites/")[1]!;

    const lookupResponse = await app.inject({
      method: "GET",
      url: `/v1/operator/invites/${token}`
    });
    expect(lookupResponse.statusCode).toBe(200);
    expect(operatorInviteLookupResponseSchema.parse(lookupResponse.json())).toMatchObject({
      operator: {
        email: "pilot.owner@example.com",
        role: "owner"
      }
    });

    const signInBeforeAcceptance = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/sign-in",
      payload: {
        email: "pilot.owner@example.com",
        password: "AcceptedPassword123!"
      }
    });
    expect(signInBeforeAcceptance.statusCode).toBe(401);

    const acceptResponse = await app.inject({
      method: "POST",
      url: `/v1/operator/invites/${token}/accept`,
      payload: {
        password: "AcceptedPassword123!"
      }
    });
    expect(acceptResponse.statusCode).toBe(200);
    expect(operatorInviteAcceptResponseSchema.parse(acceptResponse.json())).toMatchObject({
      operator: {
        email: "pilot.owner@example.com",
        active: true
      },
      invite: {
        status: "consumed"
      }
    });

    const reuseResponse = await app.inject({
      method: "POST",
      url: `/v1/operator/invites/${token}/accept`,
      payload: {
        password: "AcceptedPassword123!"
      }
    });
    expect(reuseResponse.statusCode).toBe(410);
    expect(reuseResponse.json()).toMatchObject({
      code: "INVITE_CONSUMED"
    });

    const signInAfterAcceptance = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/sign-in",
      payload: {
        email: "pilot.owner@example.com",
        password: "AcceptedPassword123!"
      }
    });
    expect(signInAfterAcceptance.statusCode).toBe(200);

    await app.close();
  });

  it("fails owner invite creation clearly when production email config is incomplete", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "identity-gateway-token";
    const previousEmailProvider = process.env.EMAIL_PROVIDER;
    const previousResendApiKey = process.env.RESEND_API_KEY;
    const previousEmailFrom = process.env.OWNER_INVITE_EMAIL_FROM;
    const previousDashboardBaseUrl = process.env.CLIENT_DASHBOARD_BASE_URL;
    process.env.EMAIL_PROVIDER = "resend";
    process.env.CLIENT_DASHBOARD_BASE_URL = "https://client.example.com";
    delete process.env.RESEND_API_KEY;
    delete process.env.OWNER_INVITE_EMAIL_FROM;
    const repository = createInMemoryIdentityRepository();
    const app = await buildApp({ repository });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/identity/internal/locations/pilot-01/owner/invite",
        headers: {
          "x-gateway-token": "identity-gateway-token"
        },
        payload: {
          displayName: "Pilot Owner",
          email: "pilot.owner@example.com"
        }
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        code: "EmailConfigurationError"
      });
    } finally {
      if (previousEmailProvider === undefined) delete process.env.EMAIL_PROVIDER;
      else process.env.EMAIL_PROVIDER = previousEmailProvider;
      if (previousResendApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousResendApiKey;
      if (previousEmailFrom === undefined) delete process.env.OWNER_INVITE_EMAIL_FROM;
      else process.env.OWNER_INVITE_EMAIL_FROM = previousEmailFrom;
      if (previousDashboardBaseUrl === undefined) delete process.env.CLIENT_DASHBOARD_BASE_URL;
      else process.env.CLIENT_DASHBOARD_BASE_URL = previousDashboardBaseUrl;
      await app.close();
    }
  });
});
