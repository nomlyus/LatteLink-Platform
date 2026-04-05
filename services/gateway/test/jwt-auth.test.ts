import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { buildApp } from "../src/app.js";

const userId = "123e4567-e89b-12d3-a456-426614174000";

function buildJwtAccessToken(params: { userId: string; secret: string; exp: number; iat?: number }) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }), "utf8").toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: params.userId,
      exp: params.exp,
      iat: params.iat ?? Math.floor(Date.now() / 1000)
    }),
    "utf8"
  ).toString("base64url");
  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", params.secret).update(signingInput).digest("base64url");

  return `${signingInput}.${signature}`;
}

describe("gateway JWT customer auth", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let previousIdentityBaseUrl: string | undefined;
  let previousLoyaltyBaseUrl: string | undefined;
  let previousGatewayInternalToken: string | undefined;
  let previousJwtSecret: string | undefined;

  beforeEach(() => {
    fetchMock.mockReset();
    previousIdentityBaseUrl = process.env.IDENTITY_SERVICE_BASE_URL;
    previousLoyaltyBaseUrl = process.env.LOYALTY_SERVICE_BASE_URL;
    previousGatewayInternalToken = process.env.GATEWAY_INTERNAL_API_TOKEN;
    previousJwtSecret = process.env.JWT_SECRET;
    process.env.IDENTITY_SERVICE_BASE_URL = "http://identity.internal";
    process.env.LOYALTY_SERVICE_BASE_URL = "http://loyalty.internal";
    process.env.GATEWAY_INTERNAL_API_TOKEN = "gateway-test-token";
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    if (previousIdentityBaseUrl === undefined) {
      delete process.env.IDENTITY_SERVICE_BASE_URL;
    } else {
      process.env.IDENTITY_SERVICE_BASE_URL = previousIdentityBaseUrl;
    }

    if (previousLoyaltyBaseUrl === undefined) {
      delete process.env.LOYALTY_SERVICE_BASE_URL;
    } else {
      process.env.LOYALTY_SERVICE_BASE_URL = previousLoyaltyBaseUrl;
    }

    if (previousGatewayInternalToken === undefined) {
      delete process.env.GATEWAY_INTERNAL_API_TOKEN;
    } else {
      process.env.GATEWAY_INTERNAL_API_TOKEN = previousGatewayInternalToken;
    }

    if (previousJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousJwtSecret;
    }
  });

  it("accepts a valid JWT locally and forwards the verified x-user-id without an identity roundtrip", async () => {
    process.env.JWT_SECRET = "12345678901234567890123456789012";
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.endsWith("/v1/auth/me")) {
        throw new Error("identity roundtrip should not happen in JWT mode");
      }

      if (url.endsWith("/v1/loyalty/balance")) {
        const headers = new Headers((init?.headers ?? {}) as HeadersInit);
        expect(headers.get("x-user-id")).toBe(userId);
        expect(headers.get("x-user-id")).not.toBe("client-spoofed-user");

        return new Response(
          JSON.stringify({
            userId,
            availablePoints: 240,
            pendingPoints: 0,
            lifetimeEarned: 600
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    const token = buildJwtAccessToken({
      userId,
      secret: process.env.JWT_SECRET,
      exp: Math.floor(Date.now() / 1000) + 300
    });
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/loyalty/balance",
      headers: {
        authorization: `Bearer ${token}`,
        "x-user-id": "client-spoofed-user"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      userId
    });

    const requestedUrls = fetchMock.mock.calls.map(([input]) => (typeof input === "string" ? input : input.url));
    expect(requestedUrls).toEqual(["http://loyalty.internal/v1/loyalty/balance"]);

    await app.close();
  });

  it("rejects tampered JWT access tokens", async () => {
    process.env.JWT_SECRET = "12345678901234567890123456789012";
    const validToken = buildJwtAccessToken({
      userId,
      secret: process.env.JWT_SECRET,
      exp: Math.floor(Date.now() / 1000) + 300
    });
    const tamperedToken = `${validToken.slice(0, -1)}${validToken.endsWith("a") ? "b" : "a"}`;
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/loyalty/balance",
      headers: {
        authorization: `Bearer ${tamperedToken}`
      }
    });

    expect(response.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects expired JWT access tokens", async () => {
    process.env.JWT_SECRET = "12345678901234567890123456789012";
    const expiredToken = buildJwtAccessToken({
      userId,
      secret: process.env.JWT_SECRET,
      exp: Math.floor(Date.now() / 1000) - 60
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/loyalty/balance",
      headers: {
        authorization: `Bearer ${expiredToken}`
      }
    });

    expect(response.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();

    await app.close();
  });

  it("falls back to identity-backed bearer resolution when JWT_SECRET is unset", async () => {
    delete process.env.JWT_SECRET;
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;

      if (url.endsWith("/v1/auth/me")) {
        return new Response(
          JSON.stringify({
            userId,
            email: "owner@gazellecoffee.com",
            displayName: "Avery Quinn",
            profileCompleted: false,
            methods: ["apple", "passkey", "magic-link"]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/loyalty/balance")) {
        const headers = new Headers((init?.headers ?? {}) as HeadersInit);
        expect(headers.get("x-user-id")).toBe(userId);
        expect(headers.get("x-user-id")).not.toBe("client-spoofed-user");

        return new Response(
          JSON.stringify({
            userId,
            availablePoints: 240,
            pendingPoints: 0,
            lifetimeEarned: 600
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/loyalty/balance",
      headers: {
        authorization: "Bearer access-legacy-token",
        "x-user-id": "client-spoofed-user"
      }
    });

    expect(response.statusCode).toBe(200);

    const requestedUrls = fetchMock.mock.calls.map(([input]) => (typeof input === "string" ? input : input.url));
    expect(requestedUrls).toEqual([
      "http://identity.internal/v1/auth/me",
      "http://loyalty.internal/v1/loyalty/balance"
    ]);

    await app.close();
  });
});
