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
    vi.stubEnv("NOTIFICATIONS_PROVIDER_MODE", "simulated");
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

    const health = await app.inject({ method: "GET", url: "/v1/notifications/internal/delivery-health",
      headers: internalHeaders() });
    expect(health.json()).toMatchObject({ outcomes: [expect.objectContaining({ notificationType: "PAID",
      providerAccepted: 0, unverified: 1 })] });

    await app.close();
  });

  it("dispatches canceled order notifications once", async () => {
    const app = await buildApp();
    await app.inject({ method: "PUT", url: "/v1/devices/push-token",
      headers: gatewayHeaders({ "x-user-id": "123e4567-e89b-12d3-a456-426614174920" }),
      payload: { deviceId: "ios-cancel", platform: "ios", expoPushToken: "ExponentPushToken[cancel-token]" } });
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
      enqueued: 1,
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
      deduplicated: true
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

  it("suppresses only unconfirmed status at every dispatch boundary", () => {
    expect(shouldSuppressOrderPushStatus("PENDING_PAYMENT")).toBe(true);
    expect(shouldSuppressOrderPushStatus("CANCELED")).toBe(false);
    expect(shouldSuppressOrderPushStatus("PAID")).toBe(false);
  });

  it.each([
    ["PAID", "Order confirmed", "We've received order TEST12. We'll let you know when it's ready."],
    ["IN_PREP", "Your order is being prepared", "We're preparing order TEST12."],
    ["READY", "Your order is ready", "Order TEST12 is ready for pickup."],
    ["COMPLETED", "Thanks for your order", "Order TEST12 has been picked up. We hope to see you again soon."],
    ["CANCELED", "Order canceled", "Order TEST12 was canceled."],
    ["REFUNDED", "Order refunded", "A refund for order TEST12 has been confirmed."]
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

  it("does not send internal order notes in Expo push payloads", async () => {
    vi.stubEnv("NOTIFICATIONS_PROVIDER_MODE", "expo");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ status: "ok", id: "expo-receipt-1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174950";

    await app.inject({
      method: "PUT",
      url: "/v1/devices/push-token",
      headers: gatewayHeaders({
        "x-user-id": userId
      }),
      payload: {
        deviceId: "ios-expo",
        platform: "ios",
        expoPushToken: "ExponentPushToken[expo-token]"
      }
    });
    await app.inject({
      method: "POST",
      url: "/v1/notifications/internal/order-state",
      headers: internalHeaders(),
      payload: {
        userId,
        orderId: "123e4567-e89b-12d3-a456-426614174951",
        status: "PAID",
        pickupCode: "SAFE12",
        locationId: "flagship-01",
        occurredAt: "2026-03-10T17:41:00.000Z",
        note: "Internal operator note that must not be sent to the device"
      }
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
    const expoBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "[]")) as Array<{
      data: Record<string, unknown>;
    }>;
    expect(expoBody[0]?.data).not.toHaveProperty("note");
    await app.close();
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

    const receiptProcessResponse = await app.inject({
      method: "POST",
      url: "/v1/notifications/internal/receipts/process",
      payload: {}
    });
    expect(receiptProcessResponse.statusCode).toBe(401);

    const deliveryHealthResponse = await app.inject({
      method: "GET",
      url: "/v1/notifications/internal/delivery-health"
    });
    expect(deliveryHealthResponse.statusCode).toBe(401);

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

  it("polls Expo receipts, records terminal outcomes, and retires only the rejected token", async () => {
    vi.stubEnv("NOTIFICATIONS_PROVIDER_MODE", "expo");
    vi.stubEnv("NOTIFICATIONS_ENVIRONMENT", "test");
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ status: "ok", id: "ticket-1" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { "ticket-1": {
        status: "error", message: "device unregistered", details: { error: "DeviceNotRegistered" }
      } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174971";
    await app.inject({ method: "PUT", url: "/v1/devices/push-token", headers: gatewayHeaders({ "x-user-id": userId }),
      payload: { deviceId: "ios-old", platform: "ios", expoPushToken: "ExponentPushToken[old]" } });
    const orderId = "123e4567-e89b-12d3-a456-426614174972";
    const enqueue = async (status: "PAID" | "READY") => app.inject({ method: "POST",
      url: "/v1/notifications/internal/order-state", headers: internalHeaders(),
      payload: { userId, orderId, status, pickupCode: "TEST12", locationId: "merchant-location",
        occurredAt: "2030-01-01T00:00:00.000Z" } });
    await enqueue("PAID");
    const submit = await app.inject({ method: "POST", url: "/v1/notifications/internal/outbox/process",
      headers: internalHeaders(), payload: { nowIso: "2030-01-01T00:00:00.000Z" } });
    expect(submit.json()).toMatchObject({ dispatched: 1 });
    const healthBefore = await app.inject({ method: "GET", url: "/v1/notifications/internal/delivery-health",
      headers: internalHeaders() });
    expect(healthBefore.json()).toMatchObject({ submitted: 1, outcomes: [] });
    const firstPoll = await app.inject({ method: "POST", url: "/v1/notifications/internal/receipts/process",
      headers: internalHeaders(), payload: { nowIso: "2030-01-01T00:00:15.000Z" } });
    expect(firstPoll.json()).toMatchObject({ unresolved: 1 });
    const secondPoll = await app.inject({ method: "POST", url: "/v1/notifications/internal/receipts/process",
      headers: internalHeaders(), payload: { nowIso: "2030-01-01T00:00:30.000Z" } });
    expect(secondPoll.json()).toMatchObject({ failed: 1 });
    const healthAfter = await app.inject({ method: "GET", url: "/v1/notifications/internal/delivery-health",
      headers: internalHeaders() });
    expect(healthAfter.json()).toMatchObject({ submitted: 0, outcomes: [{ merchantId: "merchant-location",
      environment: "test", notificationType: "PAID", providerAccepted: 0, unverified: 0, failed: 1, expired: 0 }] });
    const receiptCall = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { ids: string[] };
    expect(receiptCall.ids).toEqual(["ticket-1"]);
    await enqueue("READY");
    const afterRetirement = await app.inject({ method: "POST", url: "/v1/notifications/internal/outbox/process",
      headers: internalHeaders(), payload: { nowIso: "2030-01-01T00:00:31.000Z" } });
    expect(afterRetirement.json()).toMatchObject({ processed: 0 });
    await app.close();
  });

  it("expires an unresolved receipt without another provider call", async () => {
    vi.stubEnv("NOTIFICATIONS_PROVIDER_MODE", "expo");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ status: "ok", id: "ticket-expiring" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174973";
    await app.inject({ method: "PUT", url: "/v1/devices/push-token", headers: gatewayHeaders({ "x-user-id": userId }),
      payload: { deviceId: "ios-expire", platform: "ios", expoPushToken: "ExponentPushToken[expire]" } });
    await app.inject({ method: "POST", url: "/v1/notifications/internal/order-state", headers: internalHeaders(),
      payload: { userId, orderId: "123e4567-e89b-12d3-a456-426614174974", status: "READY",
        pickupCode: "TEST12", locationId: "merchant-location", occurredAt: "2030-01-01T00:00:00.000Z" } });
    await app.inject({ method: "POST", url: "/v1/notifications/internal/outbox/process", headers: internalHeaders(),
      payload: { nowIso: "2030-01-01T00:00:00.000Z" } });
    const result = await app.inject({ method: "POST", url: "/v1/notifications/internal/receipts/process",
      headers: internalHeaders(), payload: { nowIso: "2030-01-02T00:00:00.000Z" } });
    expect(result.json()).toMatchObject({ expired: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("records provider acceptance from a receipt and preserves a freshly replaced device token", async () => {
    vi.stubEnv("NOTIFICATIONS_PROVIDER_MODE", "expo");
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ status: "ok", id: "ticket-old" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { "ticket-old": { status: "error",
        details: { error: "DeviceNotRegistered" } } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ status: "ok", id: "ticket-new" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { "ticket-new": { status: "ok" } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174975";
    const register = async (token: string) => app.inject({ method: "PUT", url: "/v1/devices/push-token",
      headers: gatewayHeaders({ "x-user-id": userId }),
      payload: { deviceId: "ios-replaced", platform: "ios", expoPushToken: token } });
    const notify = async (status: "PAID" | "READY") => app.inject({ method: "POST",
      url: "/v1/notifications/internal/order-state", headers: internalHeaders(), payload: { userId,
        orderId: "123e4567-e89b-12d3-a456-426614174976", status, pickupCode: "TEST12",
        locationId: "merchant-location", occurredAt: "2030-01-01T00:00:00.000Z" } });
    const process = async (nowIso: string) => app.inject({ method: "POST",
      url: "/v1/notifications/internal/outbox/process", headers: internalHeaders(), payload: { nowIso } });
    const receipts = async (nowIso: string) => app.inject({ method: "POST",
      url: "/v1/notifications/internal/receipts/process", headers: internalHeaders(), payload: { nowIso } });
    await register("ExponentPushToken[old]");
    await notify("PAID");
    await process("2030-01-01T00:00:00.000Z");
    await register("ExponentPushToken[new]");
    expect((await receipts("2030-01-01T00:00:15.000Z")).json()).toMatchObject({ failed: 1 });
    await notify("READY");
    expect((await process("2030-01-01T00:00:16.000Z")).json()).toMatchObject({ processed: 1 });
    expect((await receipts("2030-01-01T00:00:31.000Z")).json()).toMatchObject({ providerAccepted: 1 });
    const health = await app.inject({ method: "GET", url: "/v1/notifications/internal/delivery-health",
      headers: internalHeaders() });
    expect(health.json()).toMatchObject({ submitted: 0, outcomes: expect.arrayContaining([
      expect.objectContaining({ notificationType: "READY", providerAccepted: 1, unverified: 0 })]) });
    await app.close();
  });
});
