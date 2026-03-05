import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("gateway", () => {
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
});
