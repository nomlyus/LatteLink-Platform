import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("notifications service", () => {
  it("responds on /health and /ready", async () => {
    const app = await buildApp();
    const healthResponse = await app.inject({ method: "GET", url: "/health" });
    const readyResponse = await app.inject({ method: "GET", url: "/ready" });

    expect(healthResponse.statusCode).toBe(200);
    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json()).toMatchObject({
      status: "ready",
      service: "notifications",
      persistence: expect.stringMatching(/^(memory|postgres)$/)
    });
    await app.close();
  });

  it("upserts a push token, enqueues order-state notifications, and processes outbox", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174910";

    const upsertResponse = await app.inject({
      method: "PUT",
      url: "/v1/devices/push-token",
      headers: {
        "x-user-id": userId
      },
      payload: {
        deviceId: "ios-1",
        platform: "ios",
        expoPushToken: "ExponentPushToken[dev-token-1]"
      }
    });
    expect(upsertResponse.statusCode).toBe(200);
    expect(upsertResponse.json()).toEqual({ success: true });

    const dispatchResponse = await app.inject({
      method: "POST",
      url: "/v1/notifications/internal/order-state",
      payload: {
        userId,
        orderId: "123e4567-e89b-12d3-a456-426614174911",
        status: "PAID",
        pickupCode: "READY12",
        locationId: "flagship-01",
        occurredAt: "2026-03-10T17:40:00.000Z",
        note: "Payment accepted"
      }
    });

    expect(dispatchResponse.statusCode).toBe(200);
    expect(dispatchResponse.json()).toEqual({
      accepted: true,
      enqueued: 1,
      deduplicated: false
    });

    const processOutbox = await app.inject({
      method: "POST",
      url: "/v1/notifications/internal/outbox/process",
      payload: {
        batchSize: 10
      }
    });

    expect(processOutbox.statusCode).toBe(200);
    expect(processOutbox.json()).toEqual({
      processed: 1,
      dispatched: 1,
      retried: 0,
      failed: 0
    });

    await app.close();
  });

  it("deduplicates repeated order-state notifications by user/order/status", async () => {
    const app = await buildApp();
    const payload = {
      userId: "123e4567-e89b-12d3-a456-426614174920",
      orderId: "123e4567-e89b-12d3-a456-426614174921",
      status: "CANCELED",
      pickupCode: "CAN123",
      locationId: "flagship-01",
      occurredAt: "2026-03-10T17:41:00.000Z",
      note: "Canceled by customer"
    };

    const firstDispatch = await app.inject({
      method: "POST",
      url: "/v1/notifications/internal/order-state",
      payload
    });
    expect(firstDispatch.statusCode).toBe(200);
    expect(firstDispatch.json()).toEqual({
      accepted: true,
      enqueued: 0,
      deduplicated: false
    });

    const secondDispatch = await app.inject({
      method: "POST",
      url: "/v1/notifications/internal/order-state",
      payload
    });
    expect(secondDispatch.statusCode).toBe(200);
    expect(secondDispatch.json()).toEqual({
      accepted: true,
      enqueued: 0,
      deduplicated: true
    });

    const processOutbox = await app.inject({
      method: "POST",
      url: "/v1/notifications/internal/outbox/process",
      payload: {
        batchSize: 10
      }
    });
    expect(processOutbox.statusCode).toBe(200);
    expect(processOutbox.json()).toEqual({
      processed: 0,
      dispatched: 0,
      retried: 0,
      failed: 0
    });

    await app.close();
  });

  it("retries and eventually fails outbox entries for failing push tokens", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174930";
    const baseNow = "2030-01-01T00:00:00.000Z";

    await app.inject({
      method: "PUT",
      url: "/v1/devices/push-token",
      headers: {
        "x-user-id": userId
      },
      payload: {
        deviceId: "ios-failing",
        platform: "ios",
        expoPushToken: "ExponentPushToken[fail-token]"
      }
    });

    await app.inject({
      method: "POST",
      url: "/v1/notifications/internal/order-state",
      payload: {
        userId,
        orderId: "123e4567-e89b-12d3-a456-426614174931",
        status: "PAID",
        pickupCode: "FAIL01",
        locationId: "flagship-01",
        occurredAt: "2026-03-11T12:00:00.000Z"
      }
    });

    const firstAttempt = await app.inject({
      method: "POST",
      url: "/v1/notifications/internal/outbox/process",
      payload: {
        batchSize: 10,
        nowIso: baseNow
      }
    });
    expect(firstAttempt.statusCode).toBe(200);
    expect(firstAttempt.json()).toEqual({
      processed: 1,
      dispatched: 0,
      retried: 1,
      failed: 0
    });

    const secondAttempt = await app.inject({
      method: "POST",
      url: "/v1/notifications/internal/outbox/process",
      payload: {
        batchSize: 10,
        nowIso: "2030-01-01T00:00:01.000Z"
      }
    });
    expect(secondAttempt.statusCode).toBe(200);
    expect(secondAttempt.json()).toEqual({
      processed: 1,
      dispatched: 0,
      retried: 1,
      failed: 0
    });

    const thirdAttempt = await app.inject({
      method: "POST",
      url: "/v1/notifications/internal/outbox/process",
      payload: {
        batchSize: 10,
        nowIso: "2030-01-01T00:00:03.000Z"
      }
    });
    expect(thirdAttempt.statusCode).toBe(200);
    expect(thirdAttempt.json()).toEqual({
      processed: 1,
      dispatched: 0,
      retried: 0,
      failed: 1
    });

    await app.close();
  });

  it("rejects invalid x-user-id and exposes metrics counters", async () => {
    const app = await buildApp();

    const invalidUserResponse = await app.inject({
      method: "PUT",
      url: "/v1/devices/push-token",
      headers: {
        "x-user-id": "not-a-uuid"
      },
      payload: {
        deviceId: "ios-2",
        platform: "ios",
        expoPushToken: "ExponentPushToken[dev-token-2]"
      }
    });
    expect(invalidUserResponse.statusCode).toBe(400);
    expect(invalidUserResponse.json()).toMatchObject({
      code: "INVALID_USER_CONTEXT"
    });

    const metricsResponse = await app.inject({
      method: "GET",
      url: "/metrics"
    });
    expect(metricsResponse.statusCode).toBe(200);
    expect(metricsResponse.json()).toMatchObject({
      service: "notifications",
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
