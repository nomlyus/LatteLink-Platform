import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

describe("loyalty service", () => {
  beforeEach(() => {
    vi.stubEnv("GATEWAY_INTERNAL_API_TOKEN", "loyalty-gateway-token");
    vi.stubEnv("LOYALTY_INTERNAL_API_TOKEN", "loyalty-internal-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("responds on /health and /ready", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ service: "loyalty", persistence: expect.any(String) });
    await app.close();
  });

  it("propagates x-request-id and exposes metrics counters", async () => {
    const app = await buildApp();
    const requestId = "loyalty-trace-1";

    const invalidHeaderResponse = await app.inject({
      method: "GET",
      url: "/v1/loyalty/balance?locationId=rawaqcoffee01",
      headers: {
        "x-request-id": requestId,
        "x-gateway-token": "loyalty-gateway-token",
        "x-user-id": "not-a-uuid"
      }
    });

    expect(invalidHeaderResponse.statusCode).toBe(400);
    expect(invalidHeaderResponse.headers["x-request-id"]).toBe(requestId);

    const metricsResponse = await app.inject({ method: "GET", url: "/metrics" });
    expect(metricsResponse.statusCode).toBe(200);
    expect(metricsResponse.json()).toMatchObject({
      service: "loyalty",
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

  it("rejects missing x-user-id on customer read routes", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/loyalty/balance?locationId=rawaqcoffee01",
      headers: {
        "x-gateway-token": "loyalty-gateway-token"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "INVALID_USER_CONTEXT"
    });

    await app.close();
  });
});
