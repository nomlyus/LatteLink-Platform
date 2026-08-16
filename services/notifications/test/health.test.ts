import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { getOrderStatusPushCopy, shouldSuppressOrderPushStatus } from "../src/routes.js";
import type { OutboxEntry } from "../src/repository.js";

const notificationsGatewayToken = "notifications-gateway-token";
const notificationsInternalToken = "notifications-internal-token";

function gatewayHeaders(extraHeaders?: Record<string, string>) {
  return {
    "x-gateway-token": notificationsGatewayToken,
    ...extraHeaders
  };
}

function internalHeaders(extraHeaders?: Record<string, string>) {
  return {
    "x-internal-token": notificationsInternalToken,
    ...extraHeaders
  };
}

describe("notifications service", () => {
  beforeEach(() => {
    vi.stubEnv("GATEWAY_INTERNAL_API_TOKEN", notificationsGatewayToken);
    vi.stubEnv("NOTIFICATIONS_INTERNAL_API_TOKEN", notificationsInternalToken);
  });

  afterEach(() => {
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
      headers: gatewayHeaders({
        "x-user-id": userId
      }),
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
      headers: internalHeaders(),
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
      headers: internalHeaders(),
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

  it("suppresses canceled order notifications", async () => {
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
      headers: internalHeaders(),
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
      headers: internalHeaders(),
      payload
    });
    expect(secondDispatch.statusCode).toBe(200);
    expect(secondDispatch.json()).toEqual({
      accepted: true,
      enqueued: 0,
      deduplicated: false
    });

    const processOutbox = await app.inject({
      method: "POST",
      url: "/v1/notifications/internal/outbox/process",
      headers: internalHeaders(),
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

  it("suppresses unconfirmed and canceled statuses at every dispatch boundary", () => {
    expect(shouldSuppressOrderPushStatus("PENDING_PAYMENT")).toBe(true);
    expect(shouldSuppressOrderPushStatus("CANCELED")).toBe(true);
    expect(shouldSuppressOrderPushStatus("PAID")).toBe(false);
  });

  it.each([
    ["PAID", "Order confirmed", "We've received order TEST12. We'll let you know when it's ready."],
    ["IN_PREP", "Your order is being prepared", "We're preparing order TEST12."],
    ["READY", "Your order is ready", "Order TEST12 is ready for pickup."],
    ["COMPLETED", "Thanks for your order", "Order TEST12 has been picked up. We hope to see you again soon."]
  ] as const)("uses customer-facing copy for %s notifications", (status, title, body) => {
    const entry = {
      payload: {
        userId: "123e4567-e89b-12d3-a456-426614174920",
        orderId: "123e4567-e89b-12d3-a456-426614174921",
        status,
        pickupCode: "TEST12",
        locationId: "flagship-01",
        occurredAt: "2026-03-10T17:41:00.000Z",
        note: "Internal operator note that must not be shown"
      }
    } as OutboxEntry;

    expect(getOrderStatusPushCopy(entry)).toEqual({ title, body });
  });

  it("retries and eventually fails outbox entries for failing push tokens", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174930";
    const baseNow = "2030-01-01T00:00:00.000Z";

    await app.inject({
      method: "PUT",
      url: "/v1/devices/push-token",
      headers: gatewayHeaders({
        "x-user-id": userId
      }),
      payload: {
        deviceId: "ios-failing",
        platform: "ios",
        expoPushToken: "ExponentPushToken[fail-token]"
      }
    });

    await app.inject({
      method: "POST",
      url: "/v1/notifications/internal/order-state",
      headers: internalHeaders(),
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
      headers: internalHeaders(),
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
      headers: internalHeaders(),
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
      headers: internalHeaders(),
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
      headers: gatewayHeaders({
        "x-user-id": "not-a-uuid"
      }),
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

  it("rejects missing x-user-id on push-token writes", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "PUT",
      url: "/v1/devices/push-token",
      headers: gatewayHeaders(),
      payload: {
        deviceId: "ios-missing-user",
        platform: "ios",
        expoPushToken: "ExponentPushToken[missing-user]"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "INVALID_USER_CONTEXT"
    });

    await app.close();
  });

  it("rate limits push-token writes when configured threshold is reached", async () => {
    vi.stubEnv("NOTIFICATIONS_RATE_LIMIT_DEVICE_WRITE_MAX", "1");
    vi.stubEnv("NOTIFICATIONS_RATE_LIMIT_WINDOW_MS", "60000");
    const app = await buildApp();

    try {
      const firstUpsert = await app.inject({
        method: "PUT",
        url: "/v1/devices/push-token",
        headers: gatewayHeaders({
          "x-user-id": "123e4567-e89b-12d3-a456-426614174930"
        }),
        payload: {
          deviceId: "ios-rate-limit",
          platform: "ios",
          expoPushToken: "ExponentPushToken[rate-limit-1]"
        }
      });
      expect(firstUpsert.statusCode).toBe(200);

      const secondUpsert = await app.inject({
        method: "PUT",
        url: "/v1/devices/push-token",
        headers: gatewayHeaders({
          "x-user-id": "123e4567-e89b-12d3-a456-426614174930"
        }),
        payload: {
          deviceId: "ios-rate-limit",
          platform: "ios",
          expoPushToken: "ExponentPushToken[rate-limit-1]"
        }
      });
      expect(secondUpsert.statusCode).toBe(429);
    } finally {
      vi.unstubAllEnvs();
      await app.close();
    }
  });

  it("requires gateway token on push-token upsert when configured", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174999";

    const unauthorizedResponse = await app.inject({
      method: "PUT",
      url: "/v1/devices/push-token",
      headers: {
        "x-user-id": userId
      },
      payload: {
        deviceId: "ios-unauthorized",
        platform: "ios",
        expoPushToken: "ExponentPushToken[unauthorized-token]"
      }
    });
    expect(unauthorizedResponse.statusCode).toBe(401);
    expect(unauthorizedResponse.json()).toMatchObject({
      code: "UNAUTHORIZED_GATEWAY_REQUEST"
    });

    const authorizedResponse = await app.inject({
      method: "PUT",
      url: "/v1/devices/push-token",
      headers: gatewayHeaders({
        "x-user-id": userId
      }),
      payload: {
        deviceId: "ios-authorized",
        platform: "ios",
        expoPushToken: "ExponentPushToken[authorized-token]"
      }
    });
    expect(authorizedResponse.statusCode).toBe(200);
    expect(authorizedResponse.json()).toEqual({ success: true });

    await app.close();
  });

  it("requires an internal token on notifications internal routes", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/notifications/internal/order-state",
      payload: {
        userId: "123e4567-e89b-12d3-a456-426614174960",
        orderId: "123e4567-e89b-12d3-a456-426614174961",
        status: "PAID",
        pickupCode: "AUTH01",
        locationId: "flagship-01",
        occurredAt: "2026-03-11T00:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "UNAUTHORIZED_INTERNAL_REQUEST"
    });

    await app.close();
  });

  it("fails closed when notifications internal auth is not configured", async () => {
    vi.stubEnv("NOTIFICATIONS_INTERNAL_API_TOKEN", "");
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/notifications/internal/outbox/process",
      headers: internalHeaders(),
      payload: {
        batchSize: 1
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: "INTERNAL_ACCESS_NOT_CONFIGURED"
    });

    await app.close();
  });

  it("fails closed when gateway auth is not configured", async () => {
    vi.stubEnv("GATEWAY_INTERNAL_API_TOKEN", "");
    const app = await buildApp();
    const response = await app.inject({
      method: "PUT",
      url: "/v1/devices/push-token",
      headers: gatewayHeaders({
        "x-user-id": "123e4567-e89b-12d3-a456-426614174970"
      }),
      payload: {
        deviceId: "ios-misconfigured",
        platform: "ios",
        expoPushToken: "ExponentPushToken[misconfigured-token]"
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: "GATEWAY_ACCESS_NOT_CONFIGURED"
    });

    await app.close();
  });
});
