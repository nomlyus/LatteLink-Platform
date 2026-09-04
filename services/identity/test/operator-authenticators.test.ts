import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { createInMemoryIdentityRepository } from "../src/repository.js";
import { provisionOwnerAccess } from "../src/provisioning.js";

const redirectUri = "http://localhost:5173/?google_auth_callback=1";

describe("operator authenticators", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-client-secret";
    process.env.GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS = redirectUri;
    process.env.GOOGLE_OAUTH_STATE_SECRET = "google-state-secret";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    delete process.env.GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS;
    delete process.env.GOOGLE_OAUTH_STATE_SECRET;
    vi.unstubAllGlobals();
  });

  async function createOwner(
    repository: ReturnType<typeof createInMemoryIdentityRepository>,
    email: string,
    locationId: string
  ) {
    return provisionOwnerAccess(repository, {
      allowInMemory: true,
      displayName: "Owner",
      email,
      locationId,
      password: "OwnerPassword123!"
    });
  }

  async function signIn(app: Awaited<ReturnType<typeof buildApp>>, email: string) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/sign-in",
      payload: { email, password: "OwnerPassword123!" }
    });
    expect(response.statusCode).toBe(200);
    return response.json() as {
      accessToken: string;
      operator: { operatorUserId: string; locationIds: string[] };
    };
  }

  function mockGoogleIdentity(subject: string, email: string) {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === "https://oauth2.googleapis.com/token" && init?.method === "POST") {
        return new Response(JSON.stringify({ access_token: "google-access-token" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url === "https://openidconnect.googleapis.com/v1/userinfo" && init?.method === "GET") {
        return new Response(JSON.stringify({ sub: subject, email, email_verified: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
    });
  }

  it("lists the backfilled password method without exposing credential material", async () => {
    const repository = createInMemoryIdentityRepository();
    await createOwner(repository, "owner@example.com", "location-a");
    const app = await buildApp({ repository });
    const session = await signIn(app, "owner@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/v1/operator/auth/authenticators",
      headers: { authorization: `Bearer ${session.accessToken}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      recoveryCapableCount: 1,
      canRemovePassword: false,
      authenticators: [
        {
          kind: "password",
          provider: "legacy_password",
          displayName: "Password"
        }
      ]
    });
    expect(JSON.stringify(response.json())).not.toContain("passwordHash");
    expect(JSON.stringify(response.json())).not.toContain("subject");
    await app.close();
  });

  it("requires an authenticated explicit confirmation to link Google and preserves tenant scope", async () => {
    const repository = createInMemoryIdentityRepository();
    await createOwner(repository, "owner@example.com", "location-a");
    await createOwner(repository, "owner@example.com", "location-b");
    const auditSpy = vi.spyOn(repository, "writeAuditLog");
    const app = await buildApp({ repository });
    const session = await signIn(app, "owner@example.com");

    const unauthenticated = await app.inject({
      method: "GET",
      url: `/v1/operator/auth/authenticators/google/start?redirectUri=${encodeURIComponent(redirectUri)}&confirm=true`
    });
    expect(unauthenticated.statusCode).toBe(401);

    const unconfirmed = await app.inject({
      method: "GET",
      url: `/v1/operator/auth/authenticators/google/start?redirectUri=${encodeURIComponent(redirectUri)}`,
      headers: { authorization: `Bearer ${session.accessToken}` }
    });
    expect(unconfirmed.statusCode).toBe(400);

    const invalidState = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/authenticators/google/exchange",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { code: "code", state: "invalid", redirectUri, confirm: true }
    });
    expect(invalidState.statusCode).toBe(401);
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ action: "operator.authenticator.link_failed" }));

    const start = await app.inject({
      method: "GET",
      url: `/v1/operator/auth/authenticators/google/start?redirectUri=${encodeURIComponent(redirectUri)}&confirm=true`,
      headers: { authorization: `Bearer ${session.accessToken}` }
    });
    expect(start.statusCode).toBe(200);
    const state = new URL(start.json().authorizeUrl as string).searchParams.get("state");
    mockGoogleIdentity("google-owner", "different-email@example.com");

    const exchange = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/authenticators/google/exchange",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { code: "code", state, redirectUri, confirm: true }
    });
    expect(exchange.statusCode).toBe(200);
    expect(exchange.json()).toMatchObject({
      recoveryCapableCount: 2,
      authenticators: expect.arrayContaining([expect.objectContaining({ provider: "google" })])
    });
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ action: "operator.authenticator.linked" }));

    const operatorAfterLink = await repository.getOperatorUserById(session.operator.operatorUserId);
    expect(operatorAfterLink?.locationIds).toEqual(expect.arrayContaining(["location-a", "location-b"]));
    expect(operatorAfterLink?.locationIds).toHaveLength(2);
    await app.close();
  });

  it("never links by verified email during sign-in", async () => {
    const repository = createInMemoryIdentityRepository();
    await createOwner(repository, "owner@example.com", "location-a");
    const app = await buildApp({ repository });

    const start = await app.inject({
      method: "GET",
      url: `/v1/operator/auth/google/start?redirectUri=${encodeURIComponent(redirectUri)}`
    });
    const state = new URL(start.json().authorizeUrl as string).searchParams.get("state");
    mockGoogleIdentity("unlinked-google", "owner@example.com");
    const exchange = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/google/exchange",
      payload: { code: "code", state, redirectUri }
    });

    expect(exchange.statusCode).toBe(404);
    expect(exchange.json()).toMatchObject({
      code: "OPERATOR_ACCESS_NOT_GRANTED"
    });
    expect(await repository.getOperatorUserByGoogleSub("unlinked-google")).toBeUndefined();
    await app.close();
  });

  it("rejects reuse of a provider identity across canonical operators", async () => {
    const repository = createInMemoryIdentityRepository();
    const first = await createOwner(repository, "first@example.com", "location-a");
    const second = await createOwner(repository, "second@example.com", "location-b");
    await repository.linkOperatorOAuthAuthenticator({
      operatorUserId: first.operator.operatorUserId,
      provider: "google",
      issuer: "https://accounts.google.com",
      subject: "shared-google"
    });

    await expect(
      repository.linkOperatorOAuthAuthenticator({
        operatorUserId: second.operator.operatorUserId,
        provider: "google",
        issuer: "https://accounts.google.com",
        subject: "shared-google"
      })
    ).rejects.toThrow("AUTHENTICATOR_ALREADY_LINKED");
  });

  it("audits a failed attempt to link another operator's provider identity", async () => {
    const repository = createInMemoryIdentityRepository();
    const first = await createOwner(repository, "first@example.com", "location-a");
    await createOwner(repository, "second@example.com", "location-b");
    await repository.linkOperatorOAuthAuthenticator({
      operatorUserId: first.operator.operatorUserId,
      provider: "google",
      issuer: "https://accounts.google.com",
      subject: "shared-google"
    });
    const auditSpy = vi.spyOn(repository, "writeAuditLog");
    const app = await buildApp({ repository });
    const session = await signIn(app, "second@example.com");
    const start = await app.inject({
      method: "GET",
      url: `/v1/operator/auth/authenticators/google/start?redirectUri=${encodeURIComponent(redirectUri)}&confirm=true`,
      headers: { authorization: `Bearer ${session.accessToken}` }
    });
    const state = new URL(start.json().authorizeUrl as string).searchParams.get("state");
    mockGoogleIdentity("shared-google", "second@example.com");

    const exchange = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/authenticators/google/exchange",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { code: "code", state, redirectUri, confirm: true }
    });

    expect(exchange.statusCode).toBe(409);
    expect(exchange.json()).toMatchObject({ code: "AUTHENTICATOR_ALREADY_LINKED" });
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "operator.authenticator.link_failed",
        payload: expect.objectContaining({ reason: "AUTHENTICATOR_ALREADY_LINKED" })
      })
    );
    await app.close();
  });

  it("supports Apple and multiple passkeys while preventing owner recovery lockout", async () => {
    const repository = createInMemoryIdentityRepository();
    const owner = await createOwner(repository, "owner@example.com", "location-a");
    const operatorUserId = owner.operator.operatorUserId;
    const [password] = await repository.listOperatorAuthenticators(operatorUserId);
    expect(password?.provider).toBe("legacy_password");

    await repository.linkOperatorOAuthAuthenticator({
      operatorUserId,
      provider: "google",
      issuer: "https://accounts.google.com",
      subject: "google-owner"
    });
    await expect(
      repository.revokeOperatorAuthenticator({
        operatorUserId,
        authenticatorId: password!.authenticatorId
      })
    ).rejects.toThrow("OWNER_PASSWORD_REQUIRES_TWO_RECOVERY_METHODS");

    await repository.linkOperatorOAuthAuthenticator({
      operatorUserId,
      provider: "apple",
      issuer: "https://appleid.apple.com",
      subject: "apple-private-relay-subject",
      metadata: { email: "relay@privaterelay.appleid.com" }
    });
    await repository.addOperatorPasskeyAuthenticator({
      operatorUserId,
      credentialId: "passkey-one",
      displayName: "MacBook",
      recoveryCapable: true
    });
    await repository.addOperatorPasskeyAuthenticator({
      operatorUserId,
      credentialId: "passkey-two",
      displayName: "iPhone",
      recoveryCapable: true
    });

    await expect(
      repository.revokeOperatorAuthenticator({
        operatorUserId,
        authenticatorId: password!.authenticatorId
      })
    ).resolves.toMatchObject({ provider: "legacy_password" });
    expect((await repository.listOperatorAuthenticators(operatorUserId)).map((entry) => entry.provider)).toEqual([
      "google",
      "apple",
      "webauthn",
      "webauthn"
    ]);
  });
});
