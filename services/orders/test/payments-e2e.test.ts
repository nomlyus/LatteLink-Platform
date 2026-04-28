import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { orderQuoteSchema, orderSchema } from "@lattelink/contracts-orders";
import { buildApp as buildOrdersApp } from "../src/app.js";
import { buildApp as buildPaymentsApp } from "../../payments/src/app.js";

const sampleQuotePayload = {
  locationId: "flagship-01",
  items: [
    {
      itemId: "latte",
      quantity: 1,
      customization: {
        selectedOptions: [
          { groupId: "size", optionId: "regular" },
          { groupId: "milk", optionId: "whole" }
        ],
        notes: ""
      }
    },
    { itemId: "croissant", quantity: 1 }
  ],
  pointsToRedeem: 0
};

const defaultOrderUserId = "123e4567-e89b-12d3-a456-426614174000";
const internalPaymentsToken = "orders-internal-token";

type LoyaltyBalance = {
  userId: string;
  locationId: string;
  availablePoints: number;
  pendingPoints: number;
  lifetimeEarned: number;
};

type LoyaltyLedgerEntry = {
  id: string;
  type: "EARN" | "REDEEM" | "REFUND" | "ADJUSTMENT";
  points: number;
  orderId?: string;
  locationId: string;
  createdAt: string;
};

type NotificationDispatchEvent = {
  userId: string;
  orderId: string;
  status: string;
};

function buildLoyaltyHarnessApp() {
  const app = Fastify();
  const balancesByScope = new Map<string, LoyaltyBalance>();
  const ledgerByScope = new Map<string, LoyaltyLedgerEntry[]>();
  const idempotencyByScope = new Map<string, Map<string, { fingerprint: string; response: unknown }>>();

  function resolveUserId(headers: Record<string, unknown>) {
    const headerValue = headers["x-user-id"];
    return typeof headerValue === "string" ? headerValue : defaultOrderUserId;
  }

  function scopeKey(userId: string, locationId: string) {
    return `${locationId}:${userId}`;
  }

  function ensureBalance(userId: string, locationId: string) {
    const key = scopeKey(userId, locationId);
    const existing = balancesByScope.get(key);
    if (existing) {
      return existing;
    }

    const created: LoyaltyBalance = {
      userId,
      locationId,
      availablePoints: 0,
      pendingPoints: 0,
      lifetimeEarned: 0
    };
    balancesByScope.set(key, created);
    return created;
  }

  function ensureLedger(userId: string, locationId: string) {
    const key = scopeKey(userId, locationId);
    const existing = ledgerByScope.get(key);
    if (existing) {
      return existing;
    }

    const created: LoyaltyLedgerEntry[] = [];
    ledgerByScope.set(key, created);
    return created;
  }

  function ensureIdempotencyStore(userId: string, locationId: string) {
    const key = scopeKey(userId, locationId);
    const existing = idempotencyByScope.get(key);
    if (existing) {
      return existing;
    }

    const created = new Map<string, { fingerprint: string; response: unknown }>();
    idempotencyByScope.set(key, created);
    return created;
  }

  app.get("/v1/loyalty/balance", async (request) => {
    const userId = resolveUserId(request.headers as Record<string, unknown>);
    const locationId = String((request.query as Record<string, unknown>).locationId ?? sampleQuotePayload.locationId);
    return ensureBalance(userId, locationId);
  });

  app.get("/v1/loyalty/ledger", async (request) => {
    const userId = resolveUserId(request.headers as Record<string, unknown>);
    const locationId = String((request.query as Record<string, unknown>).locationId ?? sampleQuotePayload.locationId);
    return [...ensureLedger(userId, locationId)].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  });

  app.post("/v1/loyalty/internal/ledger/apply", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const userId = String(body.userId ?? defaultOrderUserId);
    const locationId = String(body.locationId ?? sampleQuotePayload.locationId);
    const orderId = String(body.orderId ?? "");
    const idempotencyKey = String(body.idempotencyKey ?? "");
    const mutationType = String(body.type ?? "");

    if (!orderId || !idempotencyKey) {
      return reply.status(400).send({ code: "INVALID_LOYALTY_MUTATION" });
    }

    const idempotencyStore = ensureIdempotencyStore(userId, locationId);
    const idempotencyScope = `${userId}:${locationId}:${idempotencyKey}`;
    const fingerprint = JSON.stringify({
      type: mutationType,
      locationId,
      orderId,
      amountCents: body.amountCents ?? null,
      points: body.points ?? null
    });
    const existingMutation = idempotencyStore.get(idempotencyScope);
    if (existingMutation) {
      if (existingMutation.fingerprint !== fingerprint) {
        return reply.status(409).send({ code: "IDEMPOTENCY_KEY_REUSE" });
      }

      return existingMutation.response;
    }

    const balance = ensureBalance(userId, locationId);
    let deltaPoints = 0;
    let lifetimeDelta = 0;
    if (mutationType === "EARN") {
      const amountCents = Number(body.amountCents ?? 0);
      deltaPoints = amountCents;
      lifetimeDelta = amountCents;
    } else if (mutationType === "REDEEM") {
      deltaPoints = -Number(body.amountCents ?? 0);
    } else if (mutationType === "REFUND") {
      deltaPoints = Number(body.amountCents ?? 0);
    } else if (mutationType === "ADJUSTMENT") {
      deltaPoints = Number(body.points ?? 0);
    } else {
      return reply.status(400).send({ code: "INVALID_LOYALTY_MUTATION" });
    }

    if (balance.availablePoints + deltaPoints < 0) {
      return reply.status(409).send({ code: "INSUFFICIENT_POINTS" });
    }

    const nextBalance: LoyaltyBalance = {
      userId,
      locationId,
      availablePoints: balance.availablePoints + deltaPoints,
      pendingPoints: balance.pendingPoints,
      lifetimeEarned: balance.lifetimeEarned + lifetimeDelta
    };
    balancesByScope.set(scopeKey(userId, locationId), nextBalance);

    const entry: LoyaltyLedgerEntry = {
      id: randomUUID(),
      type: mutationType as LoyaltyLedgerEntry["type"],
      points: deltaPoints,
      orderId,
      locationId,
      createdAt: new Date().toISOString()
    };
    const ledger = ensureLedger(userId, locationId);
    ledger.push(entry);

    const response = {
      entry,
      balance: nextBalance
    };
    idempotencyStore.set(idempotencyScope, {
      fingerprint,
      response
    });

    return response;
  });

  return app;
}

function buildNotificationsHarnessApp() {
  const app = Fastify();
  const events: NotificationDispatchEvent[] = [];
  const dispatchedKeys = new Set<string>();

  app.post("/v1/notifications/internal/order-state", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const event: NotificationDispatchEvent = {
      userId: String(body.userId ?? ""),
      orderId: String(body.orderId ?? ""),
      status: String(body.status ?? "")
    };
    const dispatchKey = `${event.userId}:${event.orderId}:${event.status}`;
    const deduplicated = dispatchedKeys.has(dispatchKey);
    if (!deduplicated) {
      dispatchedKeys.add(dispatchKey);
      events.push(event);
    }

    return {
      accepted: true,
      enqueued: 1,
      deduplicated
    };
  });

  app.get("/v1/notifications/internal/events", async () => ({ events }));

  return app;
}

function buildCatalogHarnessApp() {
  const app = Fastify();

  app.get("/v1/store/config", async () => ({
    locationId: "flagship-01",
    hoursText: "Daily · 7:00 AM - 6:00 PM",
    isOpen: true,
    nextOpenAt: null,
    prepEtaMinutes: 12,
    taxRateBasisPoints: 600,
    pickupInstructions: "Pickup at the flagship order counter."
  }));

  return app;
}

describe.sequential("orders + payments e2e", () => {
  let ordersApp: FastifyInstance | undefined;
  let paymentsApp: FastifyInstance | undefined;
  let loyaltyApp: FastifyInstance | undefined;
  let notificationsApp: FastifyInstance | undefined;
  let previousPaymentsBaseUrl: string | undefined;
  let previousLoyaltyBaseUrl: string | undefined;
  let previousNotificationsBaseUrl: string | undefined;
  let previousCatalogBaseUrl: string | undefined;
  let previousOrdersInternalToken: string | undefined;
  let catalogApp: FastifyInstance | undefined;

  async function createOrder(input?: { pointsToRedeem?: number; userId?: string }) {
    if (!ordersApp) {
      throw new Error("Orders app not initialized");
    }

    const userId = input?.userId ?? defaultOrderUserId;
    const headers = { "x-user-id": userId };
    const quoteResponse = await ordersApp.inject({
      method: "POST",
      url: "/v1/orders/quote",
      headers,
      payload: {
        ...sampleQuotePayload,
        pointsToRedeem: input?.pointsToRedeem ?? sampleQuotePayload.pointsToRedeem
      }
    });
    expect(quoteResponse.statusCode).toBe(200);
    const quote = orderQuoteSchema.parse(quoteResponse.json());

    const createResponse = await ordersApp.inject({
      method: "POST",
      url: "/v1/orders",
      headers,
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });
    expect(createResponse.statusCode).toBe(200);
    return orderSchema.parse(createResponse.json());
  }

  async function reconcileCharge(input: {
    orderId: string;
    eventId: string;
    paymentId?: string;
    provider?: "STRIPE" | "CLOVER";
    status?: "SUCCEEDED" | "DECLINED" | "TIMEOUT";
  }) {
    if (!ordersApp) {
      throw new Error("Orders app not initialized");
    }

    return ordersApp.inject({
      method: "POST",
      url: "/v1/orders/internal/payments/reconcile",
      headers: {
        "x-internal-token": internalPaymentsToken
      },
      payload: {
        eventId: input.eventId,
        provider: input.provider ?? "STRIPE",
        kind: "CHARGE",
        orderId: input.orderId,
        paymentId: input.paymentId ?? `pi-${input.orderId}`,
        status: input.status ?? "SUCCEEDED",
        occurredAt: "2026-03-11T00:00:00.000Z"
      }
    });
  }

  beforeEach(async () => {
    previousPaymentsBaseUrl = process.env.PAYMENTS_SERVICE_BASE_URL;
    previousLoyaltyBaseUrl = process.env.LOYALTY_SERVICE_BASE_URL;
    previousNotificationsBaseUrl = process.env.NOTIFICATIONS_SERVICE_BASE_URL;
    previousCatalogBaseUrl = process.env.CATALOG_SERVICE_BASE_URL;
    previousOrdersInternalToken = process.env.ORDERS_INTERNAL_API_TOKEN;

    process.env.ORDERS_INTERNAL_API_TOKEN = internalPaymentsToken;
    paymentsApp = await buildPaymentsApp();
    await paymentsApp.listen({ host: "127.0.0.1", port: 0 });
    const paymentsAddress = paymentsApp.server.address() as AddressInfo | null;
    if (!paymentsAddress || typeof paymentsAddress.port !== "number") {
      throw new Error("Failed to resolve payments test port");
    }

    loyaltyApp = buildLoyaltyHarnessApp();
    await loyaltyApp.listen({ host: "127.0.0.1", port: 0 });
    const loyaltyAddress = loyaltyApp.server.address() as AddressInfo | null;
    if (!loyaltyAddress || typeof loyaltyAddress.port !== "number") {
      throw new Error("Failed to resolve loyalty test port");
    }

    notificationsApp = buildNotificationsHarnessApp();
    await notificationsApp.listen({ host: "127.0.0.1", port: 0 });
    const notificationsAddress = notificationsApp.server.address() as AddressInfo | null;
    if (!notificationsAddress || typeof notificationsAddress.port !== "number") {
      throw new Error("Failed to resolve notifications test port");
    }

    catalogApp = buildCatalogHarnessApp();
    await catalogApp.listen({ host: "127.0.0.1", port: 0 });
    const catalogAddress = catalogApp.server.address() as AddressInfo | null;
    if (!catalogAddress || typeof catalogAddress.port !== "number") {
      throw new Error("Failed to resolve catalog test port");
    }

    process.env.PAYMENTS_SERVICE_BASE_URL = `http://127.0.0.1:${paymentsAddress.port}`;
    process.env.LOYALTY_SERVICE_BASE_URL = `http://127.0.0.1:${loyaltyAddress.port}`;
    process.env.NOTIFICATIONS_SERVICE_BASE_URL = `http://127.0.0.1:${notificationsAddress.port}`;
    process.env.CATALOG_SERVICE_BASE_URL = `http://127.0.0.1:${catalogAddress.port}`;
    ordersApp = await buildOrdersApp();
  });

  afterEach(async () => {
    if (ordersApp) {
      await ordersApp.close();
      ordersApp = undefined;
    }

    if (paymentsApp) {
      await paymentsApp.close();
      paymentsApp = undefined;
    }

    if (loyaltyApp) {
      await loyaltyApp.close();
      loyaltyApp = undefined;
    }

    if (notificationsApp) {
      await notificationsApp.close();
      notificationsApp = undefined;
    }

    if (catalogApp) {
      await catalogApp.close();
      catalogApp = undefined;
    }

    if (previousPaymentsBaseUrl === undefined) {
      delete process.env.PAYMENTS_SERVICE_BASE_URL;
    } else {
      process.env.PAYMENTS_SERVICE_BASE_URL = previousPaymentsBaseUrl;
    }

    if (previousLoyaltyBaseUrl === undefined) {
      delete process.env.LOYALTY_SERVICE_BASE_URL;
    } else {
      process.env.LOYALTY_SERVICE_BASE_URL = previousLoyaltyBaseUrl;
    }

    if (previousNotificationsBaseUrl === undefined) {
      delete process.env.NOTIFICATIONS_SERVICE_BASE_URL;
    } else {
      process.env.NOTIFICATIONS_SERVICE_BASE_URL = previousNotificationsBaseUrl;
    }

    if (previousCatalogBaseUrl === undefined) {
      delete process.env.CATALOG_SERVICE_BASE_URL;
    } else {
      process.env.CATALOG_SERVICE_BASE_URL = previousCatalogBaseUrl;
    }

    if (previousOrdersInternalToken === undefined) {
      delete process.env.ORDERS_INTERNAL_API_TOKEN;
    } else {
      process.env.ORDERS_INTERNAL_API_TOKEN = previousOrdersInternalToken;
    }
  });

  it("leaves orders pending on timeout reconciliation until a later success arrives", async () => {
    const order = await createOrder();

    const timeoutPaymentId = `pi-timeout-${order.id}`;
    const firstTimeout = await reconcileCharge({
      orderId: order.id,
      eventId: "evt_timeout_attempt_1",
      paymentId: timeoutPaymentId,
      status: "TIMEOUT"
    });
    expect(firstTimeout.statusCode).toBe(200);
    expect(firstTimeout.json()).toMatchObject({
      accepted: true,
      applied: false,
      orderStatus: "PENDING_PAYMENT"
    });

    const secondTimeout = await reconcileCharge({
      orderId: order.id,
      eventId: "evt_timeout_attempt_2",
      paymentId: timeoutPaymentId,
      status: "TIMEOUT"
    });
    expect(secondTimeout.statusCode).toBe(200);
    expect(secondTimeout.json()).toMatchObject({
      accepted: true,
      applied: false,
      orderStatus: "PENDING_PAYMENT"
    });

    const reconciledPayment = await reconcileCharge({
      orderId: order.id,
      eventId: "evt_timeout_recovery_1",
      paymentId: timeoutPaymentId
    });
    expect(reconciledPayment.statusCode).toBe(200);
    expect(reconciledPayment.json()).toMatchObject({
      accepted: true,
      applied: true,
      orderStatus: "PAID"
    });

    const getOrder = await ordersApp.inject({
      method: "GET",
      url: `/v1/orders/${order.id}`
    });
    expect(getOrder.statusCode).toBe(200);
    expect(orderSchema.parse(getOrder.json()).status).toBe("PAID");
  });

  it("ignores declined reconciliation until a later success settles the order", async () => {
    const order = await createOrder();

    const declinedPayment = await reconcileCharge({
      orderId: order.id,
      eventId: "evt_decline_attempt_1",
      paymentId: `pi-decline-${order.id}`,
      status: "DECLINED"
    });
    expect(declinedPayment.statusCode).toBe(200);
    expect(declinedPayment.json()).toMatchObject({
      accepted: true,
      applied: false,
      orderStatus: "PENDING_PAYMENT"
    });

    const pendingOrder = await ordersApp.inject({
      method: "GET",
      url: `/v1/orders/${order.id}`
    });
    expect(pendingOrder.statusCode).toBe(200);
    expect(orderSchema.parse(pendingOrder.json()).status).toBe("PENDING_PAYMENT");

    const recoveredPayment = await reconcileCharge({
      orderId: order.id,
      eventId: "evt_decline_recovery_2",
      paymentId: `pi-decline-${order.id}`
    });
    expect(recoveredPayment.statusCode).toBe(200);
    expect(recoveredPayment.json()).toMatchObject({
      accepted: true,
      applied: true,
      orderStatus: "PAID"
    });
  });

  it("keeps successful payment reconciliation idempotent for repeated events", async () => {
    const order = await createOrder();

    const firstPay = await reconcileCharge({
      orderId: order.id,
      eventId: "evt-pay-success-idem",
      paymentId: `pi-success-${order.id}`
    });
    const secondPay = await reconcileCharge({
      orderId: order.id,
      eventId: "evt-pay-success-idem",
      paymentId: `pi-success-${order.id}`
    });

    expect(firstPay.statusCode).toBe(200);
    expect(secondPay.statusCode).toBe(200);
    expect(firstPay.json()).toMatchObject({ accepted: true, applied: true, orderStatus: "PAID" });
    expect(secondPay.json()).toMatchObject({ accepted: true, applied: false, orderStatus: "PAID" });

    const paidOrderResponse = await ordersApp.inject({
      method: "GET",
      url: `/v1/orders/${order.id}`
    });
    expect(paidOrderResponse.statusCode).toBe(200);
    const paidOrder = orderSchema.parse(paidOrderResponse.json());
    expect(paidOrder.status).toBe("PAID");
    expect(paidOrder.timeline).toHaveLength(2);

    const directSubmitOrder = await paymentsApp.inject({
      method: "POST",
      url: "/v1/payments/orders/submit",
      headers: {
        "x-internal-token": internalPaymentsToken
      },
      payload: paidOrder
    });
    expect(directSubmitOrder.statusCode).toBe(200);
    expect(directSubmitOrder.json()).toMatchObject({
      accepted: true
    });
  });

  it("exposes a paid order through list and detail reads after reconciliation", async () => {
    const order = await createOrder();

    const payResponse = await reconcileCharge({
      orderId: order.id,
      eventId: "evt-visibility-check-pay"
    });

    expect(payResponse.statusCode).toBe(200);
    expect(payResponse.json()).toMatchObject({
      accepted: true,
      applied: true,
      orderStatus: "PAID"
    });

    const listResponse = await ordersApp.inject({
      method: "GET",
      url: "/v1/orders"
    });
    expect(listResponse.statusCode).toBe(200);
    const visibleOrders = orderSchema.array().parse(listResponse.json());
    expect(visibleOrders).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: order.id, status: "PAID" })])
    );

    const detailResponse = await ordersApp.inject({
      method: "GET",
      url: `/v1/orders/${order.id}`
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(orderSchema.parse(detailResponse.json())).toMatchObject({
      id: order.id,
      status: "PAID"
    });
  });

  it("supports refund failure recovery on cancel retry", async () => {
    const order = await createOrder();

    const paidOrderResponse = await reconcileCharge({
      orderId: order.id,
      eventId: "evt-cancel-flow-pay"
    });
    expect(paidOrderResponse.statusCode).toBe(200);
    expect(paidOrderResponse.json()).toMatchObject({ accepted: true, orderStatus: "PAID" });

    const rejectedRefundCancel = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/cancel`,
      payload: {
        reason: "please reject this refund"
      }
    });
    expect(rejectedRefundCancel.statusCode).toBe(409);
    expect(rejectedRefundCancel.json()).toMatchObject({ code: "REFUND_REJECTED" });

    const orderAfterRejectedRefund = await ordersApp.inject({
      method: "GET",
      url: `/v1/orders/${order.id}`
    });
    expect(orderAfterRejectedRefund.statusCode).toBe(200);
    expect(orderSchema.parse(orderAfterRejectedRefund.json()).status).toBe("PAID");

    const recoveredCancel = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/cancel`,
      payload: {
        reason: "customer changed mind"
      }
    });
    expect(recoveredCancel.statusCode).toBe(200);

    const canceledOrder = orderSchema.parse(recoveredCancel.json());
    expect(canceledOrder.status).toBe("CANCELED");

    const repeatedCancel = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/cancel`,
      payload: {
        reason: "customer changed mind"
      }
    });
    expect(repeatedCancel.statusCode).toBe(200);
    expect(orderSchema.parse(repeatedCancel.json()).timeline).toHaveLength(canceledOrder.timeline.length);
  });

  it("wires loyalty earn/redeem and reversal mutations across reconciliation + cancel", async () => {
    if (!loyaltyApp) {
      throw new Error("Loyalty app not initialized");
    }

    const userId = "123e4567-e89b-12d3-a456-426614174980";
    const seedOrderId = "123e4567-e89b-12d3-a456-426614174981";
    const seedMutation = await loyaltyApp.inject({
      method: "POST",
      url: "/v1/loyalty/internal/ledger/apply",
      payload: {
        userId,
        orderId: seedOrderId,
        type: "EARN",
        amountCents: 500,
        idempotencyKey: "seed-loyalty-500"
      }
    });
    expect(seedMutation.statusCode).toBe(200);

    const order = await createOrder({ pointsToRedeem: 125, userId });
    const payResponse = await reconcileCharge({
      orderId: order.id,
      eventId: "evt-loyalty-pay-idem"
    });
    expect(payResponse.statusCode).toBe(200);
    const paidOrderResponse = await ordersApp.inject({
      method: "GET",
      url: `/v1/orders/${order.id}`,
      headers: {
        "x-user-id": userId
      }
    });
    expect(paidOrderResponse.statusCode).toBe(200);
    const paidOrder = orderSchema.parse(paidOrderResponse.json());
    expect(paidOrder.status).toBe("PAID");

    const cancelResponse = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/cancel`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        reason: "customer canceled paid order"
      }
    });
    expect(cancelResponse.statusCode).toBe(200);
    expect(orderSchema.parse(cancelResponse.json()).status).toBe("CANCELED");

    const balanceResponse = await loyaltyApp.inject({
      method: "GET",
      url: `/v1/loyalty/balance?locationId=${sampleQuotePayload.locationId}`,
      headers: {
        "x-user-id": userId
      }
    });
    expect(balanceResponse.statusCode).toBe(200);
    expect(balanceResponse.json()).toMatchObject({
      availablePoints: 500,
      lifetimeEarned: 500 + paidOrder.total.amountCents
    });

    const ledgerResponse = await loyaltyApp.inject({
      method: "GET",
      url: `/v1/loyalty/ledger?locationId=${sampleQuotePayload.locationId}`,
      headers: {
        "x-user-id": userId
      }
    });
    expect(ledgerResponse.statusCode).toBe(200);
    const ledger = ledgerResponse.json() as Array<{ orderId?: string; type: string; points: number }>;
    const orderLedger = ledger.filter((entry) => entry.orderId === order.id);
    expect(orderLedger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "REDEEM", points: -125 }),
        expect.objectContaining({ type: "EARN", points: paidOrder.total.amountCents }),
        expect.objectContaining({ type: "ADJUSTMENT", points: -paidOrder.total.amountCents }),
        expect.objectContaining({ type: "REFUND", points: 125 })
      ])
    );
  });

  it("dispatches order-state notifications on create, reconcile, and cancel transitions", async () => {
    if (!notificationsApp) {
      throw new Error("Notifications app not initialized");
    }

    const userId = "123e4567-e89b-12d3-a456-426614174990";
    const order = await createOrder({ pointsToRedeem: 0, userId });

    const payResponse = await reconcileCharge({
      orderId: order.id,
      eventId: "evt-notify-e2e-pay-1"
    });
    expect(payResponse.statusCode).toBe(200);

    const repeatedPay = await reconcileCharge({
      orderId: order.id,
      eventId: "evt-notify-e2e-pay-1"
    });
    expect(repeatedPay.statusCode).toBe(200);

    const cancelResponse = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/cancel`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        reason: "customer changed mind"
      }
    });
    expect(cancelResponse.statusCode).toBe(200);

    const repeatedCancel = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/cancel`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        reason: "customer changed mind"
      }
    });
    expect(repeatedCancel.statusCode).toBe(200);

    const eventsResponse = await notificationsApp.inject({
      method: "GET",
      url: "/v1/notifications/internal/events"
    });
    expect(eventsResponse.statusCode).toBe(200);

    const events = (eventsResponse.json() as { events: NotificationDispatchEvent[] }).events.filter(
      (event) => event.orderId === order.id
    );
    expect(events).toHaveLength(3);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId, status: "PENDING_PAYMENT" }),
        expect.objectContaining({ userId, status: "PAID" }),
        expect.objectContaining({ userId, status: "CANCELED" })
      ])
    );
  });
});
