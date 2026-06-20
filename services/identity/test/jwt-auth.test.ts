import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { createSignedAppleIdentityToken, installAppleAuthEnv, installAppleAuthFetchMock } from "./apple-test-helpers.js";

function decodeJwtPayload(token: string) {
  const [, encodedPayload] = token.split(".");
  if (!encodedPayload) {
    throw new Error(`Expected JWT payload segment in token: ${token}`);
  }

  return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
    sub?: string;
    exp?: number;
    iat?: number;
    jti?: string;
  };
}

describe("identity JWT access tokens", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("issues JWT access tokens when JWT_SECRET is configured", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    vi.stubEnv("JWT_SECRET", "12345678901234567890123456789012");
    installAppleAuthEnv();
    installAppleAuthFetchMock();

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/apple/exchange",
      payload: {
        identityToken: createSignedAppleIdentityToken({
          sub: "apple-user-jwt",
          email: "owner@gazellecoffee.com",
          nonce: "jwt-issuance"
        }),
        authorizationCode: "auth-code",
        nonce: "jwt-issuance"
      }
    });

    expect(response.statusCode).toBe(200);

    const session = response.json();
    expect(session.accessToken.split(".")).toHaveLength(3);

    const claims = decodeJwtPayload(session.accessToken);
    expect(claims.sub).toBe(session.userId);
    expect(claims.iat).toBe(Math.floor(Date.parse("2030-01-01T00:00:00.000Z") / 1000));
    expect(claims.exp).toBe(Math.floor(Date.parse(session.expiresAt) / 1000));
    expect(claims.jti).toEqual(expect.any(String));

    const meResponse = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`
      }
    });

    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json()).toMatchObject({
      userId: session.userId
    });

    await app.close();
  });

  it("keeps issuing opaque access tokens when JWT_SECRET is unset", async () => {
    installAppleAuthEnv();
    installAppleAuthFetchMock();
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/apple/exchange",
      payload: {
        identityToken: createSignedAppleIdentityToken({
          sub: "apple-user-jwt",
          email: "owner@gazellecoffee.com",
          nonce: "opaque-fallback"
        }),
        authorizationCode: "auth-code",
        nonce: "opaque-fallback"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().accessToken).toMatch(/^access_[A-Za-z0-9_-]{43}$/);
    expect(response.json().accessToken).not.toContain("opaque-fallback");
    expect(response.json().accessToken.split(".")).toHaveLength(1);

    await app.close();
  });
});
