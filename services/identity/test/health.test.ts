import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

describe("identity service", () => {
  it("responds on /health and /ready", async () => {
    const app = await buildApp();
    const healthResponse = await app.inject({ method: "GET", url: "/health" });
    const readyResponse = await app.inject({ method: "GET", url: "/ready" });

    expect(healthResponse.statusCode).toBe(200);
    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json()).toMatchObject({
      status: "ready",
      service: "identity",
      persistence: expect.stringMatching(/^(memory|postgres)$/)
    });
    await app.close();
  });

  it("creates auth session for apple exchange", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/apple/exchange",
      payload: {
        identityToken: "identity-token",
        authorizationCode: "auth-code",
        nonce: "nonce-value"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().accessToken).toContain("nonce-value");
    await app.close();
  });

  it("returns unauthorized for /v1/auth/me without bearer token", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/auth/me" });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("supports auth session -> me happy path", async () => {
    const app = await buildApp();
    const exchange = await app.inject({
      method: "POST",
      url: "/v1/auth/apple/exchange",
      payload: {
        identityToken: "identity-token",
        authorizationCode: "auth-code",
        nonce: "happy-path"
      }
    });

    expect(exchange.statusCode).toBe(200);
    const session = exchange.json();

    const me = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`
      }
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      email: "owner@gazellecoffee.com"
    });
    await app.close();
  });

  it("supports refresh rotation and invalidates prior access tokens after logout", async () => {
    const app = await buildApp();

    const exchange = await app.inject({
      method: "POST",
      url: "/v1/auth/apple/exchange",
      payload: {
        identityToken: "identity-token",
        authorizationCode: "auth-code",
        nonce: "rotation"
      }
    });

    expect(exchange.statusCode).toBe(200);
    const session = exchange.json();

    const refresh = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refreshToken: session.refreshToken
      }
    });

    expect(refresh.statusCode).toBe(200);
    const rotatedSession = refresh.json();
    expect(rotatedSession.accessToken).not.toBe(session.accessToken);

    const oldSessionMe = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`
      }
    });
    expect(oldSessionMe.statusCode).toBe(401);

    const newSessionMe = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: `Bearer ${rotatedSession.accessToken}`
      }
    });
    expect(newSessionMe.statusCode).toBe(200);

    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      payload: {
        refreshToken: rotatedSession.refreshToken
      }
    });
    expect(logout.statusCode).toBe(200);

    const postLogoutMe = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: `Bearer ${rotatedSession.accessToken}`
      }
    });
    expect(postLogoutMe.statusCode).toBe(401);

    const invalidRefresh = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refreshToken: "refresh-invalid"
      }
    });
    expect(invalidRefresh.statusCode).toBe(401);
    expect(invalidRefresh.json()).toMatchObject({
      code: "INVALID_REFRESH_TOKEN"
    });

    await app.close();
  });

  it("rejects register verify when passkey challenge is unknown", async () => {
    const app = await buildApp();
    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: "webauthn.create",
        challenge: "challenge-that-does-not-exist",
        origin: "https://localhost"
      }),
      "utf8"
    ).toString("base64url");

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/verify",
      payload: {
        id: "credential-id",
        rawId: "credential-id",
        type: "public-key",
        response: {
          clientDataJSON,
          attestationObject: "dGVzdA"
        }
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "INVALID_PASSKEY_CHALLENGE"
    });
    await app.close();
  });

  it("rejects auth verify for unknown passkey credential", async () => {
    const app = await buildApp();
    const challengeResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/passkey/auth/challenge",
      payload: {
        userId: "123e4567-e89b-12d3-a456-426614174000"
      }
    });
    expect(challengeResponse.statusCode).toBe(200);
    const challenge = challengeResponse.json().challenge as string;

    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge,
        origin: "https://localhost"
      }),
      "utf8"
    ).toString("base64url");

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/passkey/auth/verify",
      payload: {
        id: "credential-id-not-registered",
        rawId: "credential-id-not-registered",
        type: "public-key",
        response: {
          clientDataJSON,
          authenticatorData: "dGVzdA",
          signature: "dGVzdA"
        }
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "UNKNOWN_PASSKEY_CREDENTIAL"
    });
    await app.close();
  });

  it("propagates x-request-id and exposes metrics counters", async () => {
    const app = await buildApp();
    const requestId = "identity-trace-1";

    const unauthorized = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        "x-request-id": requestId
      }
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.headers["x-request-id"]).toBe(requestId);

    const metricsResponse = await app.inject({ method: "GET", url: "/metrics" });
    expect(metricsResponse.statusCode).toBe(200);
    expect(metricsResponse.json()).toMatchObject({
      service: "identity",
      requests: expect.objectContaining({
        total: expect.any(Number),
        status2xx: expect.any(Number),
        status4xx: expect.any(Number),
        status5xx: expect.any(Number)
      })
    });
    expect(metricsResponse.json().requests.total).toBeGreaterThanOrEqual(1);
    expect(metricsResponse.json().requests.status4xx).toBeGreaterThanOrEqual(1);

    await app.close();
  });

  it("rate limits apple exchange when configured threshold is reached", async () => {
    vi.stubEnv("IDENTITY_RATE_LIMIT_APPLE_EXCHANGE_MAX", "1");
    vi.stubEnv("IDENTITY_RATE_LIMIT_WINDOW_MS", "60000");
    const app = await buildApp();

    try {
      const firstExchange = await app.inject({
        method: "POST",
        url: "/v1/auth/apple/exchange",
        payload: {
          identityToken: "identity-token",
          authorizationCode: "auth-code",
          nonce: "limit-1"
        }
      });
      expect(firstExchange.statusCode).toBe(200);

      const secondExchange = await app.inject({
        method: "POST",
        url: "/v1/auth/apple/exchange",
        payload: {
          identityToken: "identity-token",
          authorizationCode: "auth-code",
          nonce: "limit-2"
        }
      });
      expect(secondExchange.statusCode).toBe(429);
    } finally {
      vi.unstubAllEnvs();
      await app.close();
    }
  });
});
