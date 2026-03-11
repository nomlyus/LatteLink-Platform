import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { orderQuoteSchema, orderSchema } from "@gazelle/contracts-orders";
import { buildApp } from "../src/app.js";

const sampleQuotePayload = {
  locationId: "flagship-01",
  items: [
    { itemId: "latte", quantity: 2 },
    { itemId: "croissant", quantity: 1 }
  ],
  pointsToRedeem: 125
};

function paymentsResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("orders service", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    const defaultUserId = "123e4567-e89b-12d3-a456-426614174000";
    const loyaltyIdempotency = new Map<
      string,
      {
        fingerprint: string;
        response: Record<string, unknown>;
      }
    >();
    const loyaltyBalances = new Map<
      string,
      {
        availablePoints: number;
        pendingPoints: number;
        lifetimeEarned: number;
      }
    >();
    const dispatchedOrderStateKeys = new Set<string>();
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string" && init.body.length > 0
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {};

      if (url.endsWith("/v1/payments/charges") && method === "POST") {
        const applePayToken = String(body.applePayToken ?? "").toLowerCase();
        if (applePayToken.includes("decline")) {
          return paymentsResponse({
            paymentId: "123e4567-e89b-12d3-a456-426614174101",
            provider: "CLOVER",
            orderId: body.orderId,
            status: "DECLINED",
            approved: false,
            amountCents: body.amountCents,
            currency: "USD",
            occurredAt: "2026-03-10T00:00:00.000Z",
            declineCode: "CARD_DECLINED",
            message: "Clover declined the charge"
          });
        }

        if (applePayToken.includes("timeout")) {
          return paymentsResponse({
            paymentId: "123e4567-e89b-12d3-a456-426614174102",
            provider: "CLOVER",
            orderId: body.orderId,
            status: "TIMEOUT",
            approved: false,
            amountCents: body.amountCents,
            currency: "USD",
            occurredAt: "2026-03-10T00:01:00.000Z",
            message: "Clover timed out while processing charge"
          });
        }

        return paymentsResponse({
          paymentId: "123e4567-e89b-12d3-a456-426614174100",
          provider: "CLOVER",
          orderId: body.orderId,
          status: "SUCCEEDED",
          approved: true,
          amountCents: body.amountCents,
          currency: "USD",
          occurredAt: "2026-03-10T00:00:00.000Z",
          message: "Clover accepted the charge"
        });
      }

      if (url.endsWith("/v1/payments/refunds") && method === "POST") {
        const reason = String(body.reason ?? "").toLowerCase();
        const rejected = reason.includes("reject");

        return paymentsResponse({
          refundId: rejected
            ? "123e4567-e89b-12d3-a456-426614174202"
            : "123e4567-e89b-12d3-a456-426614174201",
          provider: "CLOVER",
          orderId: body.orderId,
          paymentId: body.paymentId,
          status: rejected ? "REJECTED" : "REFUNDED",
          amountCents: body.amountCents,
          currency: "USD",
          occurredAt: "2026-03-10T00:02:00.000Z",
          message: rejected ? "Clover rejected the refund" : "Clover accepted the refund"
        });
      }

      if (url.endsWith("/v1/loyalty/internal/ledger/apply") && method === "POST") {
        const userId = String(body.userId ?? defaultUserId);
        const idempotencyKey = String(body.idempotencyKey ?? "");
        const mutationType = String(body.type ?? "");
        const idempotencyScope = `${userId}:${idempotencyKey}`;
        const fingerprint = JSON.stringify({
          type: mutationType,
          orderId: body.orderId ?? null,
          amountCents: body.amountCents ?? null,
          points: body.points ?? null
        });
        const existingMutation = loyaltyIdempotency.get(idempotencyScope);
        if (existingMutation) {
          if (existingMutation.fingerprint !== fingerprint) {
            return paymentsResponse(
              {
                code: "IDEMPOTENCY_KEY_REUSE",
                message: "idempotencyKey was already used with a different mutation payload"
              },
              409
            );
          }

          return paymentsResponse(existingMutation.response);
        }

        const balance = loyaltyBalances.get(userId) ?? {
          availablePoints: 2_000,
          pendingPoints: 0,
          lifetimeEarned: 2_000
        };
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
          return paymentsResponse({ code: "INVALID_LOYALTY_MUTATION" }, 400);
        }

        if (balance.availablePoints + deltaPoints < 0) {
          return paymentsResponse(
            {
              code: "INSUFFICIENT_POINTS",
              message: "Mutation would result in a negative availablePoints balance"
            },
            409
          );
        }

        const nextBalance = {
          availablePoints: balance.availablePoints + deltaPoints,
          pendingPoints: balance.pendingPoints,
          lifetimeEarned: balance.lifetimeEarned + lifetimeDelta
        };
        loyaltyBalances.set(userId, nextBalance);

        const response = {
          entry: {
            id: randomUUID(),
            type: mutationType,
            points: deltaPoints,
            orderId: body.orderId,
            createdAt: "2026-03-10T00:03:00.000Z"
          },
          balance: {
            userId,
            ...nextBalance
          }
        };
        loyaltyIdempotency.set(idempotencyScope, {
          fingerprint,
          response
        });
        return paymentsResponse(response);
      }

      if (url.endsWith("/v1/notifications/internal/order-state") && method === "POST") {
        const userId = String(body.userId ?? defaultUserId);
        const orderId = String(body.orderId ?? "");
        const status = String(body.status ?? "");
        const dispatchKey = `${userId}:${orderId}:${status}`;
        const deduplicated = dispatchedOrderStateKeys.has(dispatchKey);
        if (!deduplicated) {
          dispatchedOrderStateKeys.add(dispatchKey);
        }

        return paymentsResponse({
          accepted: true,
          enqueued: 1,
          deduplicated
        });
      }

      throw new Error(`Unhandled payments request in test: ${method} ${url}`);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("responds on /health and /ready", async () => {
    const app = await buildApp();
    const healthResponse = await app.inject({ method: "GET", url: "/health" });
    const readyResponse = await app.inject({ method: "GET", url: "/ready" });

    expect(healthResponse.statusCode).toBe(200);
    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json()).toMatchObject({
      status: "ready",
      service: "orders",
      persistence: expect.stringMatching(/^(memory|postgres)$/)
    });
    await app.close();
  });

  it("creates quote and order, then exposes get/list lifecycle endpoints", async () => {
    const app = await buildApp();

    const quoteResponse = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      payload: sampleQuotePayload
    });
    expect(quoteResponse.statusCode).toBe(200);
    const quote = orderQuoteSchema.parse(quoteResponse.json());
    expect(quote.total.amountCents).toBeGreaterThan(0);

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/orders",
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });
    expect(createResponse.statusCode).toBe(200);
    const order = orderSchema.parse(createResponse.json());
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.timeline).toHaveLength(1);

    const getResponse = await app.inject({
      method: "GET",
      url: `/v1/orders/${order.id}`
    });
    expect(getResponse.statusCode).toBe(200);
    expect(orderSchema.parse(getResponse.json()).id).toBe(order.id);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/orders"
    });
    expect(listResponse.statusCode).toBe(200);
    const listed = listResponse.json() as Array<{ id: string }>;
    expect(listed.some((entry) => entry.id === order.id)).toBe(true);

    await app.close();
  });

  it("treats create and pay operations as idempotent", async () => {
    const app = await buildApp();
    const quoteResponse = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      payload: sampleQuotePayload
    });
    const quote = orderQuoteSchema.parse(quoteResponse.json());

    const createPayload = {
      quoteId: quote.quoteId,
      quoteHash: quote.quoteHash
    };

    const firstCreate = await app.inject({
      method: "POST",
      url: "/v1/orders",
      payload: createPayload
    });
    const secondCreate = await app.inject({
      method: "POST",
      url: "/v1/orders",
      payload: createPayload
    });

    expect(firstCreate.statusCode).toBe(200);
    expect(secondCreate.statusCode).toBe(200);

    const createdOrder = orderSchema.parse(firstCreate.json());
    const secondOrder = orderSchema.parse(secondCreate.json());
    expect(secondOrder.id).toBe(createdOrder.id);

    const firstPay = await app.inject({
      method: "POST",
      url: `/v1/orders/${createdOrder.id}/pay`,
      payload: {
        applePayToken: "apple-pay-token",
        idempotencyKey: "pay-1"
      }
    });
    const secondPay = await app.inject({
      method: "POST",
      url: `/v1/orders/${createdOrder.id}/pay`,
      payload: {
        applePayToken: "apple-pay-token",
        idempotencyKey: "pay-1"
      }
    });

    const paidOrder = orderSchema.parse(firstPay.json());
    const paidOrderRepeat = orderSchema.parse(secondPay.json());

    expect(firstPay.statusCode).toBe(200);
    expect(secondPay.statusCode).toBe(200);
    expect(paidOrder.status).toBe("PAID");
    expect(paidOrderRepeat.timeline).toHaveLength(paidOrder.timeline.length);
    expect(paidOrder.timeline).toHaveLength(2);
    const paymentChargeCalls = fetchMock.mock.calls.filter(([input]) =>
      (typeof input === "string" ? input : input.toString()).endsWith("/v1/payments/charges")
    );
    expect(paymentChargeCalls).toHaveLength(1);
    const loyaltyMutationCalls = fetchMock.mock.calls.filter(([input]) =>
      (typeof input === "string" ? input : input.toString()).endsWith("/v1/loyalty/internal/ledger/apply")
    );
    expect(loyaltyMutationCalls).toHaveLength(2);

    await app.close();
  });

  it("rejects mismatched quote hashes and blocks payment after cancellation", async () => {
    const app = await buildApp();
    const quoteResponse = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      payload: sampleQuotePayload
    });
    const quote = orderQuoteSchema.parse(quoteResponse.json());

    const mismatchedCreate = await app.inject({
      method: "POST",
      url: "/v1/orders",
      payload: {
        quoteId: quote.quoteId,
        quoteHash: "incorrect-hash"
      }
    });
    expect(mismatchedCreate.statusCode).toBe(409);
    expect(mismatchedCreate.json()).toMatchObject({ code: "QUOTE_HASH_MISMATCH" });

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/orders",
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });
    const order = orderSchema.parse(createResponse.json());

    const cancelResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/cancel`,
      payload: { reason: "changed mind" }
    });
    const canceledOrder = orderSchema.parse(cancelResponse.json());
    expect(canceledOrder.status).toBe("CANCELED");

    const repeatedCancel = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/cancel`,
      payload: { reason: "still changed mind" }
    });
    const repeatedCanceledOrder = orderSchema.parse(repeatedCancel.json());
    expect(repeatedCanceledOrder.timeline).toHaveLength(canceledOrder.timeline.length);

    const payCanceledOrder = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-token",
        idempotencyKey: "pay-after-cancel"
      }
    });
    expect(payCanceledOrder.statusCode).toBe(409);
    expect(payCanceledOrder.json()).toMatchObject({ code: "ORDER_NOT_PAYABLE" });

    await app.close();
  });

  it("maps Clover decline and timeout payment paths", async () => {
    const app = await buildApp();
    const quoteResponse = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      payload: sampleQuotePayload
    });
    const quote = orderQuoteSchema.parse(quoteResponse.json());

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/orders",
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });
    const order = orderSchema.parse(createResponse.json());

    const declined = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-decline-token",
        idempotencyKey: "pay-decline"
      }
    });
    expect(declined.statusCode).toBe(402);
    expect(declined.json()).toMatchObject({ code: "PAYMENT_DECLINED" });

    const timedOut = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-timeout-token",
        idempotencyKey: "pay-timeout"
      }
    });
    expect(timedOut.statusCode).toBe(504);
    expect(timedOut.json()).toMatchObject({ code: "PAYMENT_TIMEOUT" });

    const getOrder = await app.inject({
      method: "GET",
      url: `/v1/orders/${order.id}`
    });
    expect(getOrder.statusCode).toBe(200);
    expect(orderSchema.parse(getOrder.json()).status).toBe("PENDING_PAYMENT");

    await app.close();
  });

  it("submits Clover refund during paid-order cancellation and handles rejection", async () => {
    const app = await buildApp();
    const quoteResponse = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      payload: sampleQuotePayload
    });
    const quote = orderQuoteSchema.parse(quoteResponse.json());

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/orders",
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });
    const paidOrderCandidate = orderSchema.parse(createResponse.json());

    const payResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${paidOrderCandidate.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "pay-for-refund"
      }
    });
    expect(payResponse.statusCode).toBe(200);
    expect(orderSchema.parse(payResponse.json()).status).toBe("PAID");

    const successfulCancel = await app.inject({
      method: "POST",
      url: `/v1/orders/${paidOrderCandidate.id}/cancel`,
      payload: { reason: "changed mind" }
    });
    expect(successfulCancel.statusCode).toBe(200);
    expect(orderSchema.parse(successfulCancel.json()).status).toBe("CANCELED");
    const loyaltyMutations = fetchMock.mock.calls
      .filter(
        ([input, init]) =>
          (typeof input === "string" ? input : input.toString()).endsWith("/v1/loyalty/internal/ledger/apply") &&
          (init?.method ?? "GET") === "POST"
      )
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    expect(loyaltyMutations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "REDEEM",
          idempotencyKey: `order:${paidOrderCandidate.id}:loyalty:redeem`
        }),
        expect.objectContaining({
          type: "EARN",
          idempotencyKey: `order:${paidOrderCandidate.id}:loyalty:earn`
        }),
        expect.objectContaining({
          type: "ADJUSTMENT",
          idempotencyKey: `order:${paidOrderCandidate.id}:loyalty:reverse-earn`
        }),
        expect.objectContaining({
          type: "REFUND",
          idempotencyKey: `order:${paidOrderCandidate.id}:loyalty:refund-redeem`
        })
      ])
    );

    const rejectedRefundQuote = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      payload: sampleQuotePayload
    });
    const rejectedQuote = orderQuoteSchema.parse(rejectedRefundQuote.json());
    const rejectedCreate = await app.inject({
      method: "POST",
      url: "/v1/orders",
      payload: {
        quoteId: rejectedQuote.quoteId,
        quoteHash: rejectedQuote.quoteHash
      }
    });
    const rejectedOrder = orderSchema.parse(rejectedCreate.json());
    await app.inject({
      method: "POST",
      url: `/v1/orders/${rejectedOrder.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "pay-reject-refund"
      }
    });

    const rejectedCancel = await app.inject({
      method: "POST",
      url: `/v1/orders/${rejectedOrder.id}/cancel`,
      payload: { reason: "please reject refund" }
    });
    expect(rejectedCancel.statusCode).toBe(409);
    expect(rejectedCancel.json()).toMatchObject({ code: "REFUND_REJECTED" });

    await app.close();
  });

  it("emits order-state notifications on create, pay, and cancel without duplicates", async () => {
    const app = await buildApp();
    const quoteResponse = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      payload: sampleQuotePayload
    });
    const quote = orderQuoteSchema.parse(quoteResponse.json());

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/orders",
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });
    const createdOrder = orderSchema.parse(createResponse.json());

    const firstPay = await app.inject({
      method: "POST",
      url: `/v1/orders/${createdOrder.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "notify-pay-1"
      }
    });
    expect(firstPay.statusCode).toBe(200);

    const repeatedPay = await app.inject({
      method: "POST",
      url: `/v1/orders/${createdOrder.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "notify-pay-1"
      }
    });
    expect(repeatedPay.statusCode).toBe(200);

    const firstCancel = await app.inject({
      method: "POST",
      url: `/v1/orders/${createdOrder.id}/cancel`,
      payload: { reason: "changed mind" }
    });
    expect(firstCancel.statusCode).toBe(200);

    const repeatedCancel = await app.inject({
      method: "POST",
      url: `/v1/orders/${createdOrder.id}/cancel`,
      payload: { reason: "still changed mind" }
    });
    expect(repeatedCancel.statusCode).toBe(200);

    const notificationPayloads = fetchMock.mock.calls
      .filter(
        ([input, init]) =>
          (typeof input === "string" ? input : input.toString()).endsWith("/v1/notifications/internal/order-state") &&
          (init?.method ?? "GET") === "POST"
      )
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>)
      .filter((payload) => payload.orderId === createdOrder.id);

    expect(notificationPayloads).toHaveLength(3);
    expect(notificationPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "PENDING_PAYMENT" }),
        expect.objectContaining({ status: "PAID" }),
        expect.objectContaining({ status: "CANCELED" })
      ])
    );

    await app.close();
  });

  it("rejects invalid x-user-id header and exposes metrics counters", async () => {
    const app = await buildApp();
    const quoteResponse = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      payload: sampleQuotePayload
    });
    expect(quoteResponse.statusCode).toBe(200);
    const quote = orderQuoteSchema.parse(quoteResponse.json());

    const createWithInvalidUser = await app.inject({
      method: "POST",
      url: "/v1/orders",
      headers: {
        "x-user-id": "not-a-uuid"
      },
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });
    expect(createWithInvalidUser.statusCode).toBe(400);
    expect(createWithInvalidUser.json()).toMatchObject({
      code: "INVALID_USER_CONTEXT"
    });

    const metricsResponse = await app.inject({
      method: "GET",
      url: "/metrics"
    });
    expect(metricsResponse.statusCode).toBe(200);
    expect(metricsResponse.json()).toMatchObject({
      service: "orders",
      requests: expect.objectContaining({
        total: expect.any(Number),
        status2xx: expect.any(Number),
        status4xx: expect.any(Number),
        status5xx: expect.any(Number)
      })
    });
    expect(metricsResponse.json().requests.total).toBeGreaterThanOrEqual(2);

    await app.close();
  });
});
