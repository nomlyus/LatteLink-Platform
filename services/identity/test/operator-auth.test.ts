import { afterEach, describe, expect, it, vi } from "vitest";
import type { MailSender } from "../src/mail.js";
import { buildApp } from "../src/app.js";
import { createInMemoryIdentityRepository } from "../src/repository.js";
import { provisionOwnerAccess } from "../src/provisioning.js";
import { internalOwnerProvisionResponseSchema, internalOwnerSummarySchema } from "@lattelink/contracts-auth";

const ownerEmail = "owner@gazellecoffee.com";
const ownerPassword = "LatteLinkOwner123!";
const staffEmail = "staff@gazellecoffee.com";
const staffPassword = "LatteLinkStaff123!";
const locationId = "rawaqcoffee01";

function createCapturingMailSender() {
  const sender: MailSender = {
    async sendMagicLink() {
      // operator password/session tests do not rely on outbound delivery
    }
  };

  return { sender };
}

async function signInOperator(app: Awaited<ReturnType<typeof buildApp>>, email: string, password: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/operator/auth/sign-in",
    payload: {
      email,
      password
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

async function provisionStaff(repository: ReturnType<typeof createInMemoryIdentityRepository>) {
  await repository.createOperatorUser({
    displayName: "Lead Barista",
    email: staffEmail,
    role: "staff",
    locationId,
    password: staffPassword
  });
}

describe("operator auth", () => {
  const previousGatewayToken = process.env.GATEWAY_INTERNAL_API_TOKEN;

  afterEach(() => {
    vi.useRealTimers();
    if (previousGatewayToken === undefined) {
      delete process.env.GATEWAY_INTERNAL_API_TOKEN;
    } else {
      process.env.GATEWAY_INTERNAL_API_TOKEN = previousGatewayToken;
    }
  });

  it("supports refresh rotation and invalidates prior operator access tokens after logout", async () => {
    const repository = createInMemoryIdentityRepository();
    await provisionOwner(repository);
    const { sender } = createCapturingMailSender();
    const app = await buildApp({ repository, mailSender: sender });

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

  it("lets expired operator access tokens recover through refresh", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));

    const repository = createInMemoryIdentityRepository();
    await provisionOwner(repository);
    const { sender } = createCapturingMailSender();
    const app = await buildApp({ repository, mailSender: sender });
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

  it("enforces owner-only staff management boundaries", async () => {
    const repository = createInMemoryIdentityRepository();
    await provisionOwner(repository);
    await provisionStaff(repository);
    const { sender } = createCapturingMailSender();
    const app = await buildApp({ repository, mailSender: sender });

    const ownerSession = await signInOperator(app, ownerEmail, ownerPassword);
    const staffSession = await signInOperator(app, staffEmail, staffPassword);

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
        expect.objectContaining({ email: staffEmail, role: "staff" })
      ])
    );

    const staffList = await app.inject({
      method: "GET",
      url: "/v1/operator/users",
      headers: {
        authorization: `Bearer ${staffSession.accessToken}`
      }
    });
    expect(staffList.statusCode).toBe(403);
    expect(staffList.json()).toMatchObject({
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

    const staffCreate = await app.inject({
      method: "POST",
      url: "/v1/operator/users",
      headers: {
        authorization: `Bearer ${staffSession.accessToken}`
      },
      payload: {
        displayName: "Blocked User",
        email: "blocked@gazellecoffee.com",
        role: "staff",
        password: "BlockedUser123!"
      }
    });
    expect(staffCreate.statusCode).toBe(403);
    expect(staffCreate.json()).toMatchObject({
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

  it("provisions a first owner through the gateway-protected internal route", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "identity-gateway-token";
    const repository = createInMemoryIdentityRepository();
    const { sender } = createCapturingMailSender();
    const app = await buildApp({ repository, mailSender: sender });

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
    const { sender } = createCapturingMailSender();
    const app = await buildApp({ repository, mailSender: sender });

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
});
