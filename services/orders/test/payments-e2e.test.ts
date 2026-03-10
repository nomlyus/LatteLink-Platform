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
    { itemId: "latte", quantity: 1 },
    { itemId: "croissant", quantity: 1 }
  ],
  pointsToRedeem: 0
};

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

function buildLoyaltyHarnessApp() {
  const app = Fastify();
  const defaultUserId = "123e4567-e89b-12d3-a456-426614174000";
  const balancesByUserId = new Map<string, LoyaltyBalance>();
  const ledgerByUserId = new Map<string, LoyaltyLedgerEntry[]>();
  const idempotencyByUserId = new Map<string, Map<string, { fingerprint: string; response: unknown }>>();

  function resolveUserId(headers: Record<string, unknown>) {
    const headerValue = headers["x-user-id"];
    return typeof headerValue === "string" ? headerValue : defaultUserId;
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
    const userId = String(body.userId ?? defaultUserId);
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

describe.sequential("orders + payments e2e", () => {
  let ordersApp: FastifyInstance | undefined;
  let paymentsApp: FastifyInstance | undefined;
  let loyaltyApp: FastifyInstance | undefined;
  let previousPaymentsBaseUrl: string | undefined;
  let previousLoyaltyBaseUrl: string | undefined;

  async function createOrder(input?: { pointsToRedeem?: number; userId?: string }) {
    if (!ordersApp) {
      throw new Error("Orders app not initialized");
    }

    const headers = input?.userId ? { "x-user-id": input.userId } : undefined;
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

    process.env.PAYMENTS_SERVICE_BASE_URL = `http://127.0.0.1:${paymentsAddress.port}`;
    process.env.LOYALTY_SERVICE_BASE_URL = `http://127.0.0.1:${loyaltyAddress.port}`;
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
  });

  it("keeps timeout retries idempotent per key and recovers with a new key", async () => {
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
    expect(secondTimeout.statusCode).toBe(504);
    expect(secondTimeout.json()).toMatchObject({ code: "PAYMENT_TIMEOUT" });
    expect(secondTimeout.json().details.paymentId).toBe(firstTimeout.json().details.paymentId);

    const recoveredPayment = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "timeout-recovery-2"
      }
    });
    expect(recoveredPayment.statusCode).toBe(200);
    expect(orderSchema.parse(recoveredPayment.json()).status).toBe("PAID");
  });

  it("allows decline retry recovery with a new idempotency key", async () => {
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
    expect(declinedPayment.json()).toMatchObject({ code: "PAYMENT_DECLINED" });

    const recoveredPayment = await ordersApp.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "decline-recovery-2"
      }
    });
    expect(recoveredPayment.statusCode).toBe(200);
    expect(orderSchema.parse(recoveredPayment.json()).status).toBe("PAID");
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
});
