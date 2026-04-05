import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

function createFakeAppleIdentityToken(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }), "utf8").toString("base64url");
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${header}.${body}.signature`;
}

const defaultAppleIdentityToken = createFakeAppleIdentityToken({
  sub: "apple-user-health",
  email: "owner@gazellecoffee.com"
});

describe("identity service", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

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
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/apple/exchange",
      payload: {
        identityToken: defaultAppleIdentityToken,
        authorizationCode: "auth-code",
        nonce: "nonce-value"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().accessToken).toContain("nonce-value");
    expect(response.json().expiresAt).toBe("2030-01-01T00:30:00.000Z");
    await app.close();
  });

  it("requires userId for passkey registration challenges", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/challenge",
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "INVALID_USER_CONTEXT"
    });

    await app.close();
  });

  it("fails startup when DATABASE_URL is missing outside explicit in-memory mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("ALLOW_IN_MEMORY_PERSISTENCE", "");

    await expect(buildApp()).rejects.toThrow(/DATABASE_URL/);
  });

  it("returns unauthorized for /v1/auth/me without bearer token", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/auth/me" });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("supports auth session -> me happy path", async () => {
    const customerEmail = "member@example.com";
    const app = await buildApp();
    const exchange = await app.inject({
      method: "POST",
      url: "/v1/auth/apple/exchange",
      payload: {
        identityToken: createFakeAppleIdentityToken({
          sub: "apple-user-happy-path",
          email: customerEmail
        }),
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
      userId: session.userId,
      email: customerEmail,
      profileCompleted: false,
      methods: ["apple"],
      memberSince: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    });
    await app.close();
  });

  it("lets authenticated customers complete their profile", async () => {
    const app = await buildApp();
    const exchange = await app.inject({
      method: "POST",
      url: "/v1/auth/apple/exchange",
      payload: {
        identityToken: createFakeAppleIdentityToken({
          sub: "apple-user-profile",
          email: "member@example.com"
        }),
        authorizationCode: "auth-code",
        nonce: "profile-completion"
      }
    });

    expect(exchange.statusCode).toBe(200);
    const session = exchange.json();

    const update = await app.inject({
      method: "POST",
      url: "/v1/auth/profile",
      headers: {
        authorization: `Bearer ${session.accessToken}`
      },
      payload: {
        name: "Avery Quinn",
        displayName: "Avery Quinn",
        phoneNumber: "+13135550123",
        birthday: "1992-04-12"
      }
    });

    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({
      userId: session.userId,
      name: "Avery Quinn",
      displayName: "Avery Quinn",
      phoneNumber: "+13135550123",
      birthday: "1992-04-12",
      profileCompleted: true,
      methods: ["apple"]
    });

    const me = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`
      }
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      name: "Avery Quinn",
      displayName: "Avery Quinn",
      phoneNumber: "+13135550123",
      birthday: "1992-04-12",
      profileCompleted: true
    });

    await app.close();
  });

  it("supports refresh rotation and invalidates prior access tokens after logout", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    const app = await buildApp();

    const exchange = await app.inject({
      method: "POST",
      url: "/v1/auth/apple/exchange",
      payload: {
        identityToken: defaultAppleIdentityToken,
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
    expect(rotatedSession.refreshToken).not.toBe(session.refreshToken);

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

    const reusedRefresh = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refreshToken: session.refreshToken
      }
    });
    expect(reusedRefresh.statusCode).toBe(401);

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

  it("allows only one concurrent refresh rotation for the same token", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    const app = await buildApp();

    const exchange = await app.inject({
      method: "POST",
      url: "/v1/auth/apple/exchange",
      payload: {
        identityToken: defaultAppleIdentityToken,
        authorizationCode: "auth-code",
        nonce: "parallel-rotation"
      }
    });

    expect(exchange.statusCode).toBe(200);
    const session = exchange.json();

    const [firstRefresh, secondRefresh] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/v1/auth/refresh",
        payload: {
          refreshToken: session.refreshToken
        }
      }),
      app.inject({
        method: "POST",
        url: "/v1/auth/refresh",
        payload: {
          refreshToken: session.refreshToken
        }
      })
    ]);

    const successfulRefresh = firstRefresh.statusCode === 200 ? firstRefresh : secondRefresh;
    const failedRefresh = firstRefresh.statusCode === 401 ? firstRefresh : secondRefresh;

    expect(successfulRefresh.statusCode).toBe(200);
    expect(failedRefresh.statusCode).toBe(401);
    expect(failedRefresh.json()).toMatchObject({
      code: "INVALID_REFRESH_TOKEN"
    });

    const rotatedSession = successfulRefresh.json();
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

    await app.close();
  });

  it("expires access tokens after 30 minutes but allows refresh within 30 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    const app = await buildApp();

    const exchange = await app.inject({
      method: "POST",
      url: "/v1/auth/apple/exchange",
      payload: {
        identityToken: defaultAppleIdentityToken,
        authorizationCode: "auth-code",
        nonce: "thirty-minute-access"
      }
    });

    expect(exchange.statusCode).toBe(200);
    const session = exchange.json();
    expect(session.expiresAt).toBe("2030-01-01T00:30:00.000Z");

    vi.setSystemTime(new Date("2030-01-01T00:31:00.000Z"));

    const expiredMe = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`
      }
    });
    expect(expiredMe.statusCode).toBe(401);

    const refresh = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refreshToken: session.refreshToken
      }
    });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json().expiresAt).toBe("2030-01-01T01:01:00.000Z");

    await app.close();
  });

  it("expires refresh sessions after 30 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    const app = await buildApp();

    const exchange = await app.inject({
      method: "POST",
      url: "/v1/auth/apple/exchange",
      payload: {
        identityToken: defaultAppleIdentityToken,
        authorizationCode: "auth-code",
        nonce: "thirty-day-refresh"
      }
    });

    expect(exchange.statusCode).toBe(200);
    const session = exchange.json();

    vi.setSystemTime(new Date("2030-01-30T23:59:00.000Z"));
    const stillValidRefresh = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refreshToken: session.refreshToken
      }
    });
    expect(stillValidRefresh.statusCode).toBe(200);

    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    const secondExchange = await app.inject({
      method: "POST",
      url: "/v1/auth/apple/exchange",
      payload: {
        identityToken: defaultAppleIdentityToken,
        authorizationCode: "auth-code",
        nonce: "expired-refresh"
      }
    });

    expect(secondExchange.statusCode).toBe(200);
    const expiringSession = secondExchange.json();

    vi.setSystemTime(new Date("2030-01-31T00:01:00.000Z"));
    const expiredRefresh = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refreshToken: expiringSession.refreshToken
      }
    });
    expect(expiredRefresh.statusCode).toBe(401);
    expect(expiredRefresh.json()).toMatchObject({
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

  it("rate limits auth write endpoints when configured threshold is reached", async () => {
    vi.stubEnv("IDENTITY_RATE_LIMIT_AUTH_WRITE_MAX", "1");
    vi.stubEnv("IDENTITY_RATE_LIMIT_WINDOW_MS", "60000");

    const app = await buildApp();
    try {
      const firstResponse = await app.inject({
        method: "POST",
        url: "/v1/auth/magic-link/request",
        payload: {
          email: "owner@gazellecoffee.com"
        }
      });
      expect(firstResponse.statusCode).toBe(200);

      const secondResponse = await app.inject({
        method: "POST",
        url: "/v1/auth/magic-link/request",
        payload: {
          email: "owner@gazellecoffee.com"
        }
      });
      expect(secondResponse.statusCode).toBe(429);
      expect(secondResponse.json()).toMatchObject({ statusCode: 429 });
    } finally {
      await app.close();
      vi.unstubAllEnvs();
    }
  });
});
