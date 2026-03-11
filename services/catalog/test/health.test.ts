import { describe, expect, it } from "vitest";
import { menuResponseSchema, storeConfigResponseSchema } from "@gazelle/contracts-catalog";
import { buildApp } from "../src/app.js";

describe("catalog service", () => {
  it("responds on /health", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("returns v1 menu payload", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/menu" });

    expect(response.statusCode).toBe(200);
    const parsed = menuResponseSchema.parse(response.json());
    expect(parsed.categories.length).toBeGreaterThan(0);
    await app.close();
  });

  it("returns v1 store config payload", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/store/config" });

    expect(response.statusCode).toBe(200);
    const parsed = storeConfigResponseSchema.parse(response.json());
    expect(parsed.prepEtaMinutes).toBeGreaterThan(0);
    await app.close();
  });

  it("propagates x-request-id and exposes metrics counters", async () => {
    const app = await buildApp();
    const requestId = "catalog-trace-1";

    const menuResponse = await app.inject({
      method: "GET",
      url: "/v1/menu",
      headers: {
        "x-request-id": requestId
      }
    });

    expect(menuResponse.statusCode).toBe(200);
    expect(menuResponse.headers["x-request-id"]).toBe(requestId);

    const metricsResponse = await app.inject({
      method: "GET",
      url: "/metrics"
    });
    expect(metricsResponse.statusCode).toBe(200);
    expect(metricsResponse.json()).toMatchObject({
      service: "catalog",
      requests: expect.objectContaining({
        total: expect.any(Number),
        status2xx: expect.any(Number),
        status4xx: expect.any(Number),
        status5xx: expect.any(Number)
      })
    });
    expect(metricsResponse.json().requests.total).toBeGreaterThanOrEqual(1);

    await app.close();
  });
});
