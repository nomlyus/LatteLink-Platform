import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("loyalty service", () => {
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
      url: "/v1/loyalty/balance",
      headers: {
        "x-request-id": requestId,
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
});
