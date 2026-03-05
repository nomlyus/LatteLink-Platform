import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("identity service", () => {
  it("responds on /health", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
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
});
