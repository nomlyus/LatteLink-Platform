import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { createInMemoryIdentityRepository } from "../src/repository.js";
import { provisionOwnerAccess } from "../src/provisioning.js";

describe("operator Google SSO", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let previousClientId: string | undefined;
  let previousClientSecret: string | undefined;
  let previousAllowedRedirectUris: string | undefined;
  let previousStateSecret: string | undefined;

  beforeEach(() => {
    previousClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    previousClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    previousAllowedRedirectUris = process.env.GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS;
    previousStateSecret = process.env.GOOGLE_OAUTH_STATE_SECRET;
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-client-secret";
    process.env.GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS = "http://localhost:5173/?google_auth_callback=1";
    process.env.GOOGLE_OAUTH_STATE_SECRET = "google-state-secret";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    if (previousClientId === undefined) {
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    } else {
      process.env.GOOGLE_OAUTH_CLIENT_ID = previousClientId;
    }

    if (previousClientSecret === undefined) {
      delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    } else {
      process.env.GOOGLE_OAUTH_CLIENT_SECRET = previousClientSecret;
    }

    if (previousAllowedRedirectUris === undefined) {
      delete process.env.GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS;
    } else {
      process.env.GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS = previousAllowedRedirectUris;
    }

    if (previousStateSecret === undefined) {
      delete process.env.GOOGLE_OAUTH_STATE_SECRET;
    } else {
      process.env.GOOGLE_OAUTH_STATE_SECRET = previousStateSecret;
    }

    vi.unstubAllGlobals();
  });

  it("starts Google sign-in and exchanges a verified Google user into an operator session", async () => {
    const repository = createInMemoryIdentityRepository();
    const provisioned = await provisionOwnerAccess(repository, {
      allowInMemory: true,
      displayName: "Pilot Owner",
      email: "pilot.owner@example.com",
      locationId: "rawaqcoffee01",
      password: "PilotOwner123!"
    });
    await repository.linkOperatorOAuthAuthenticator({
      operatorUserId: provisioned.operator.operatorUserId,
      provider: "google",
      issuer: "https://accounts.google.com",
      subject: "google-user-123"
    });
    await provisionOwnerAccess(repository, {
      allowInMemory: true,
      displayName: "Pilot Owner",
      email: "pilot.owner@example.com",
      locationId: "pilot-01",
      password: "PilotOwner123!"
    });
    const app = await buildApp({
      repository
    });

    const startResponse = await app.inject({
      method: "GET",
      url: "/v1/operator/auth/google/start?redirectUri=http%3A%2F%2Flocalhost%3A5173%2F%3Fgoogle_auth_callback%3D1&locationId=pilot-01"
    });

    expect(startResponse.statusCode).toBe(200);
    const authorizeUrl = startResponse.json().authorizeUrl as string;
    const parsedAuthorizeUrl = new URL(authorizeUrl);
    const state = parsedAuthorizeUrl.searchParams.get("state");
    expect(state).toBeTruthy();

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method ?? "GET";

      if (url === "https://oauth2.googleapis.com/token" && method === "POST") {
        return new Response(
          JSON.stringify({
            access_token: "google-access-token",
            token_type: "Bearer",
            scope: "openid email profile"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "https://openidconnect.googleapis.com/v1/userinfo" && method === "GET") {
        return new Response(
          JSON.stringify({
            sub: "google-user-123",
            email: "pilot.owner@example.com",
            email_verified: true,
            name: "Pilot Owner"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const exchangeResponse = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/google/exchange",
      payload: {
        code: "google-auth-code",
        state,
        redirectUri: "http://localhost:5173/?google_auth_callback=1"
      }
    });

    expect(exchangeResponse.statusCode).toBe(200);
    expect(exchangeResponse.json()).toMatchObject({
      operator: {
        email: "pilot.owner@example.com",
        role: "owner",
        locationId: "pilot-01",
        locationIds: expect.arrayContaining(["rawaqcoffee01", "pilot-01"])
      }
    });

    await app.close();
  });

  it("rejects Google sign-in when the requested location is not authorized", async () => {
    const repository = createInMemoryIdentityRepository();
    const provisioned = await provisionOwnerAccess(repository, {
      allowInMemory: true,
      displayName: "Pilot Owner",
      email: "pilot.owner@example.com",
      locationId: "pilot-01",
      password: "PilotOwner123!"
    });
    await repository.linkOperatorOAuthAuthenticator({
      operatorUserId: provisioned.operator.operatorUserId,
      provider: "google",
      issuer: "https://accounts.google.com",
      subject: "google-user-unauthorized-location"
    });
    const app = await buildApp({ repository });

    const startResponse = await app.inject({
      method: "GET",
      url: "/v1/operator/auth/google/start?redirectUri=http%3A%2F%2Flocalhost%3A5173%2F%3Fgoogle_auth_callback%3D1&locationId=forbidden-01"
    });
    const state = new URL(startResponse.json().authorizeUrl as string).searchParams.get("state");

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method ?? "GET";

      if (url === "https://oauth2.googleapis.com/token" && method === "POST") {
        return new Response(JSON.stringify({ access_token: "google-access-token" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url === "https://openidconnect.googleapis.com/v1/userinfo" && method === "GET") {
        return new Response(
          JSON.stringify({
            sub: "google-user-unauthorized-location",
            email: "pilot.owner@example.com",
            email_verified: true
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const exchangeResponse = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/google/exchange",
      payload: {
        code: "google-auth-code",
        state,
        redirectUri: "http://localhost:5173/?google_auth_callback=1"
      }
    });

    expect(exchangeResponse.statusCode).toBe(403);
    expect(exchangeResponse.json()).toMatchObject({
      code: "OPERATOR_LOCATION_FORBIDDEN"
    });

    await app.close();
  });

  it("reports Google provider readiness separately from the sign-in flow", async () => {
    const app = await buildApp({
      repository: createInMemoryIdentityRepository()
    });

    const providersResponse = await app.inject({
      method: "GET",
      url: "/v1/operator/auth/providers"
    });

    expect(providersResponse.statusCode).toBe(200);
    expect(providersResponse.json()).toEqual({
      google: {
        configured: true
      }
    });

    await app.close();
  });

  it("rejects Google sign-in when the verified email is not provisioned for operator access", async () => {
    const repository = createInMemoryIdentityRepository();
    const app = await buildApp({ repository });

    const startResponse = await app.inject({
      method: "GET",
      url: "/v1/operator/auth/google/start?redirectUri=http%3A%2F%2Flocalhost%3A5173%2F%3Fgoogle_auth_callback%3D1"
    });
    const state = new URL(startResponse.json().authorizeUrl as string).searchParams.get("state");

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method ?? "GET";

      if (url === "https://oauth2.googleapis.com/token" && method === "POST") {
        return new Response(JSON.stringify({ access_token: "google-access-token" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url === "https://openidconnect.googleapis.com/v1/userinfo" && method === "GET") {
        return new Response(
          JSON.stringify({
            sub: "google-user-999",
            email: "missing@store.com",
            email_verified: true
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const exchangeResponse = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/google/exchange",
      payload: {
        code: "google-auth-code",
        state,
        redirectUri: "http://localhost:5173/?google_auth_callback=1"
      }
    });

    expect(exchangeResponse.statusCode).toBe(404);
    expect(exchangeResponse.json()).toMatchObject({
      code: "OPERATOR_ACCESS_NOT_GRANTED"
    });

    await app.close();
  });
});
