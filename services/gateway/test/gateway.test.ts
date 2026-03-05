import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

describe("gateway", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let previousIdentityBaseUrl: string | undefined;

  beforeEach(() => {
    fetchMock.mockReset();
    previousIdentityBaseUrl = process.env.IDENTITY_SERVICE_BASE_URL;
    process.env.IDENTITY_SERVICE_BASE_URL = "http://identity.internal";
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method ?? "GET";
      const authHeader = init?.headers ? new Headers(init.headers as HeadersInit).get("authorization") : null;

      if (url.endsWith("/v1/auth/apple/exchange") && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { nonce?: string };
        return new Response(
          JSON.stringify({
            accessToken: `access-${body.nonce ?? "unknown"}`,
            refreshToken: "refresh-token",
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            userId: "123e4567-e89b-12d3-a456-426614174000"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/auth/magic-link/request") && method === "POST") {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith("/v1/auth/me") && method === "GET") {
        if (!authHeader) {
          return new Response(
            JSON.stringify({
              code: "UNAUTHORIZED",
              message: "Missing or invalid auth token",
              requestId: "identity-stub"
            }),
            { status: 401, headers: { "content-type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            userId: "123e4567-e89b-12d3-a456-426614174000",
            email: "owner@gazellecoffee.com",
            methods: ["apple", "passkey", "magic-link"]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ code: "NOT_IMPLEMENTED" }), { status: 500 });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousIdentityBaseUrl === undefined) {
      delete process.env.IDENTITY_SERVICE_BASE_URL;
      return;
    }

    process.env.IDENTITY_SERVICE_BASE_URL = previousIdentityBaseUrl;
  });

  it("returns health", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("returns v1 menu", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/menu" });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("returns unauthorized on /v1/auth/me without bearer token", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/auth/me" });

    expect(response.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards apple exchange to identity", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/apple/exchange",
      payload: {
        identityToken: "identity-token",
        authorizationCode: "auth-code",
        nonce: "gateway-proxy"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().accessToken).toContain("gateway-proxy");
    await app.close();
  });

  it("requests magic link", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/magic-link/request",
      payload: { email: "owner@gazellecoffee.com" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    await app.close();
  });

  it("forwards /v1/auth/me with bearer token", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: "Bearer access-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      email: "owner@gazellecoffee.com"
    });
    await app.close();
  });
});
