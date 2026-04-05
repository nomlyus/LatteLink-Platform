import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { orderQuoteSchema, orderSchema } from "@gazelle/contracts-orders";
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
  availablePoints: number;
  pendingPoints: number;
  lifetimeEarned: number;
};

type LoyaltyLedgerEntry = {
  id: string;
  type: "EARN" | "REDEEM" | "REFUND" | "ADJUSTMENT";
  points: number;
  orderId?: string;
  createdAt: string;
};

type NotificationDispatchEvent = {
  userId: string;
  orderId: string;
  status: string;
};

function buildLoyaltyHarnessApp() {
  const app = Fastify();
  const balancesByUserId = new Map<string, LoyaltyBalance>();
  const ledgerByUserId = new Map<string, LoyaltyLedgerEntry[]>();
  const idempotencyByUserId = new Map<string, Map<string, { fingerprint: string; response: unknown }>>();

  function resolveUserId(headers: Record<string, unknown>) {
    const headerValue = headers["x-user-id"];
    return typeof headerValue === "string" ? headerValue : defaultOrderUserId;
  }

  function ensureBalance(userId: string) {
    const existing = balancesByUserId.get(userId);
    if (existing) {
      return existing;
    }

    const created: LoyaltyBalance = {
      userId,
      availablePoints: 0,
      pendingPoints: 0,
      lifetimeEarned: 0
    };
    balancesByUserId.set(userId, created);
    return created;
  }

  function ensureLedger(userId: string) {
    const existing = ledgerByUserId.get(userId);
    if (existing) {
      return existing;
    }

    const created: LoyaltyLedgerEntry[] = [];
    ledgerByUserId.set(userId, created);
    return created;
  }

  function ensureIdempotencyStore(userId: string) {
    const existing = idempotencyByUserId.get(userId);
    if (existing) {
      return existing;
    }

    const created = new Map<string, { fingerprint: string; response: unknown }>();
    idempotencyByUserId.set(userId, created);
    return created;
  }

  app.get("/v1/loyalty/balance", async (request) => {
    const userId = resolveUserId(request.headers as Record<string, unknown>);
    return ensureBalance(userId);
  });

  app.get("/v1/loyalty/ledger", async (request) => {
    const userId = resolveUserId(request.headers as Record<string, unknown>);
    return [...ensureLedger(userId)].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  });

  app.post("/v1/loyalty/internal/ledger/apply", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const userId = String(body.userId ?? defaultOrderUserId);
    const orderId = String(body.orderId ?? "");
    const idempotencyKey = String(body.idempotencyKey ?? "");
    const mutationType = String(body.type ?? "");

    if (!orderId || !idempotencyKey) {
      return reply.status(400).send({ code: "INVALID_LOYALTY_MUTATION" });
    }

    const idempotencyStore = ensureIdempotencyStore(userId);
    const idempotencyScope = `${userId}:${idempotencyKey}`;
    const fingerprint = JSON.stringify({
      type: mutationType,
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

    const balance = ensureBalance(userId);
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
      availablePoints: balance.availablePoints + deltaPoints,
      pendingPoints: balance.pendingPoints,
      lifetimeEarned: balance.lifetimeEarned + lifetimeDelta
    };
    balancesByUserId.set(userId, nextBalance);

    const entry: LoyaltyLedgerEntry = {
      id: randomUUID(),
      type: mutationType as LoyaltyLedgerEntry["type"],
      points: deltaPoints,
      orderId,
      createdAt: new Date().toISOString()
    };
    const ledger = ensureLedger(userId);
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

  it("blocks further pay attempts after a timeout until reconciliation lands", async () => {
    const order = await createOrder();

    const firstTimeout = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-timeout-token",
        idempotencyKey: "timeout-attempt-1"
      }
    });
    expect(firstTimeout.statusCode).toBe(504);
    expect(firstTimeout.json()).toMatchObject({ code: "PAYMENT_TIMEOUT" });

    const secondTimeout = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-timeout-token",
        idempotencyKey: "timeout-attempt-1"
      }
    });
    expect(secondTimeout.statusCode).toBe(409);
    expect(secondTimeout.json()).toMatchObject({ code: "PAYMENT_RECONCILIATION_PENDING" });
    expect(secondTimeout.json().details.paymentId).toBe(firstTimeout.json().details.paymentId);

    const blockedRecovery = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "timeout-recovery-2"
      }
    });
    expect(blockedRecovery.statusCode).toBe(409);
    expect(blockedRecovery.json()).toMatchObject({
      code: "PAYMENT_RECONCILIATION_PENDING",
      details: expect.objectContaining({
        paymentId: firstTimeout.json().details.paymentId,
        status: "TIMEOUT"
      })
    });

    const reconciledPayment = await ordersApp.inject({
      method: "POST",
      url: "/v1/orders/internal/payments/reconcile",
      headers: {
        "x-internal-token": internalPaymentsToken
      },
      payload: {
        eventId: "evt_timeout_recovery_1",
        provider: "CLOVER",
        kind: "CHARGE",
        orderId: order.id,
        paymentId: firstTimeout.json().details.paymentId,
        status: "SUCCEEDED",
        occurredAt: "2026-03-11T00:00:00.000Z",
        message: "Charge settled asynchronously"
      }
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

  it("cancels declined orders and blocks recovery attempts on the same order", async () => {
    const order = await createOrder();

    const declinedPayment = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-decline-token",
        idempotencyKey: "decline-attempt-1"
      }
    });
    expect(declinedPayment.statusCode).toBe(402);
    expect(declinedPayment.json()).toMatchObject({
      code: "PAYMENT_DECLINED",
      details: expect.objectContaining({
        orderId: order.id,
        orderStatus: "CANCELED"
      })
    });

    const canceledOrder = await ordersApp.inject({
      method: "GET",
      url: `/v1/orders/${order.id}`
    });
    expect(canceledOrder.statusCode).toBe(200);
    expect(orderSchema.parse(canceledOrder.json()).status).toBe("CANCELED");

    const recoveredPayment = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "decline-recovery-2"
      }
    });
    expect(recoveredPayment.statusCode).toBe(409);
    expect(recoveredPayment.json()).toMatchObject({ code: "ORDER_NOT_PAYABLE" });
  });

  it("keeps successful payments idempotent for repeated keys", async () => {
    const order = await createOrder();

    const firstPay = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "pay-success-idem"
      }
    });
    const secondPay = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "pay-success-idem"
      }
    });

    expect(firstPay.statusCode).toBe(200);
    expect(secondPay.statusCode).toBe(200);

    const firstPaidOrder = orderSchema.parse(firstPay.json());
    const secondPaidOrder = orderSchema.parse(secondPay.json());
    expect(firstPaidOrder.status).toBe("PAID");
    expect(secondPaidOrder.id).toBe(firstPaidOrder.id);
    expect(secondPaidOrder.timeline).toHaveLength(firstPaidOrder.timeline.length);
    expect(firstPaidOrder.timeline).toHaveLength(2);

    const directSubmitOrder = await paymentsApp.inject({
      method: "POST",
      url: "/v1/payments/orders/submit",
      headers: {
        "x-internal-token": internalPaymentsToken
      },
      payload: firstPaidOrder
    });
    expect(directSubmitOrder.statusCode).toBe(200);
    expect(directSubmitOrder.json()).toMatchObject({
      accepted: true
    });
  });

  it("exposes a paid order through list and detail reads after checkout", async () => {
    const order = await createOrder();

    const payResponse = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "visibility-check-pay"
      }
    });

    expect(payResponse.statusCode).toBe(200);
    const paidOrder = orderSchema.parse(payResponse.json());
    expect(paidOrder.status).toBe("PAID");

    const listResponse = await ordersApp.inject({
      method: "GET",
      url: "/v1/orders"
    });
    expect(listResponse.statusCode).toBe(200);
    const visibleOrders = orderSchema.array().parse(listResponse.json());
    expect(visibleOrders).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: paidOrder.id, status: "PAID" })])
    );

    const detailResponse = await ordersApp.inject({
      method: "GET",
      url: `/v1/orders/${paidOrder.id}`
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(orderSchema.parse(detailResponse.json())).toMatchObject({
      id: paidOrder.id,
      status: "PAID"
    });
  });

  it("supports refund failure recovery on cancel retry", async () => {
    const order = await createOrder();

    const paidOrderResponse = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "cancel-flow-pay"
      }
    });
    expect(paidOrderResponse.statusCode).toBe(200);
    expect(orderSchema.parse(paidOrderResponse.json()).status).toBe("PAID");

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

  it("wires loyalty earn/redeem and reversal mutations across pay + cancel", async () => {
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
    const payResponse = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "loyalty-pay-idem"
      }
    });
    expect(payResponse.statusCode).toBe(200);
    const paidOrder = orderSchema.parse(payResponse.json());
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
      url: "/v1/loyalty/balance",
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
      url: "/v1/loyalty/ledger",
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

  it("dispatches order-state notifications on create, pay, and cancel transitions", async () => {
    if (!notificationsApp) {
      throw new Error("Notifications app not initialized");
    }

    const userId = "123e4567-e89b-12d3-a456-426614174990";
    const order = await createOrder({ pointsToRedeem: 0, userId });

    const payResponse = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "notify-e2e-pay-1"
      }
    });
    expect(payResponse.statusCode).toBe(200);

    const repeatedPay = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      headers: {
        "x-user-id": userId
      },
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "notify-e2e-pay-1"
      }
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
