import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { orderQuoteSchema, orderSchema } from "@gazelle/contracts-orders";
import { buildApp } from "../src/app.js";

const sampleQuotePayload = {
  locationId: "flagship-01",
  items: [
    {
      itemId: "latte",
      quantity: 2,
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
  pointsToRedeem: 125
};
const defaultTestUserId = "123e4567-e89b-12d3-a456-426614174019";

function customerHeaders(userId = defaultTestUserId) {
  return {
    "x-user-id": userId
  };
}

function paymentsResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function createQuotedOrder(
  app: Awaited<ReturnType<typeof buildApp>>,
  options: {
    userId?: string;
    payload?: typeof sampleQuotePayload;
  } = {}
) {
  const payload = options.payload ?? sampleQuotePayload;
  const quoteResponse = await app.inject({
    method: "POST",
    url: "/v1/orders/quote",
    payload
  });
  expect(quoteResponse.statusCode).toBe(200);
  const quote = orderQuoteSchema.parse(quoteResponse.json());

  const createResponse = await app.inject({
    method: "POST",
    url: "/v1/orders",
    headers: customerHeaders(options.userId ?? defaultTestUserId),
    payload: {
      quoteId: quote.quoteId,
      quoteHash: quote.quoteHash
    }
  });
  expect(createResponse.statusCode).toBe(200);

  return {
    quote,
    order: orderSchema.parse(createResponse.json())
  };
}

describe("orders service", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("ORDERS_INTERNAL_API_TOKEN", "orders-internal-token");
    vi.stubEnv("LOYALTY_INTERNAL_API_TOKEN", "loyalty-internal-token");
    vi.stubEnv("NOTIFICATIONS_INTERNAL_API_TOKEN", "notifications-internal-token");
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
        const expectedInternalToken = process.env.ORDERS_INTERNAL_API_TOKEN;
        const headers = new Headers(init?.headers);
        expect(headers.get("x-internal-token")).toBe(expectedInternalToken);
        const walletData =
          typeof body.applePayWallet === "object" && body.applePayWallet !== null && "data" in body.applePayWallet
            ? (body.applePayWallet as { data?: unknown }).data
            : undefined;
        const simulationSignal = String(body.applePayToken ?? walletData ?? "").toLowerCase();
        if (simulationSignal.includes("decline")) {
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

        if (simulationSignal.includes("timeout")) {
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

        if (simulationSignal.includes("provider-error")) {
          return paymentsResponse(
            {
              code: "CLOVER_CHARGE_ERROR",
              message: "Clover rejected the source token before confirmation"
            },
            502
          );
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
        const expectedInternalToken = process.env.ORDERS_INTERNAL_API_TOKEN;
        const headers = new Headers(init?.headers);
        expect(headers.get("x-internal-token")).toBe(expectedInternalToken);
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
        const expectedInternalToken = process.env.LOYALTY_INTERNAL_API_TOKEN;
        const headers = new Headers(init?.headers);
        expect(headers.get("x-internal-token")).toBe(expectedInternalToken);
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
        const expectedInternalToken = process.env.NOTIFICATIONS_INTERNAL_API_TOKEN;
        const headers = new Headers(init?.headers);
        expect(headers.get("x-internal-token")).toBe(expectedInternalToken);
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
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
    expect(quote.tax.amountCents).toBe(99);
    expect(quote.total.amountCents).toBe(1749);
    expect(quote.items[0]).toMatchObject({
      itemId: "latte",
      itemName: "Honey Oat Latte",
      customization: {
        selectedOptions: expect.arrayContaining([
          expect.objectContaining({ groupId: "size", optionId: "regular" }),
          expect.objectContaining({ groupId: "milk", optionId: "whole" })
        ])
      }
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/orders",
      headers: {
        "x-user-id": defaultTestUserId
      },
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

  it("rejects order creation when x-user-id is missing", async () => {
    const app = await buildApp();

    const quoteResponse = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      payload: sampleQuotePayload
    });
    expect(quoteResponse.statusCode).toBe(200);
    const quote = orderQuoteSchema.parse(quoteResponse.json());

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/orders",
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });

    expect(createResponse.statusCode).toBe(400);
    expect(createResponse.json()).toMatchObject({
      code: "INVALID_USER_CONTEXT"
    });

    await app.close();
  });

  it("rejects creating a second order while the same user still has an active order", async () => {
    const app = await buildApp();

    const firstQuoteResponse = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      payload: sampleQuotePayload
    });
    expect(firstQuoteResponse.statusCode).toBe(200);
    const firstQuote = orderQuoteSchema.parse(firstQuoteResponse.json());

    const firstCreateResponse = await app.inject({
      method: "POST",
      url: "/v1/orders",
      headers: {
        "x-user-id": defaultTestUserId
      },
      payload: {
        quoteId: firstQuote.quoteId,
        quoteHash: firstQuote.quoteHash
      }
    });
    expect(firstCreateResponse.statusCode).toBe(200);
    const firstOrder = orderSchema.parse(firstCreateResponse.json());

    const secondQuoteResponse = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      payload: {
        ...sampleQuotePayload,
        pointsToRedeem: 0
      }
    });
    expect(secondQuoteResponse.statusCode).toBe(200);
    const secondQuote = orderQuoteSchema.parse(secondQuoteResponse.json());

    const secondCreateResponse = await app.inject({
      method: "POST",
      url: "/v1/orders",
      headers: {
        "x-user-id": defaultTestUserId
      },
      payload: {
        quoteId: secondQuote.quoteId,
        quoteHash: secondQuote.quoteHash
      }
    });

    expect(secondCreateResponse.statusCode).toBe(409);
    expect(secondCreateResponse.json()).toMatchObject({
      code: "ACTIVE_ORDER_EXISTS",
      details: {
        orderId: firstOrder.id,
        status: "PENDING_PAYMENT",
        pickupCode: firstOrder.pickupCode
      }
    });

    await app.close();
  });

  it("fails startup when DATABASE_URL is missing outside explicit in-memory mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("ALLOW_IN_MEMORY_PERSISTENCE", "");

    await expect(buildApp()).rejects.toThrow(/DATABASE_URL/);
  });

  it("scopes order history to the provided x-user-id header", async () => {
    const app = await buildApp();
    const firstUserId = "123e4567-e89b-12d3-a456-426614174001";
    const secondUserId = "123e4567-e89b-12d3-a456-426614174002";

    const firstOrder = await createQuotedOrder(app, { userId: firstUserId });
    const secondOrder = await createQuotedOrder(app, { userId: secondUserId });

    const firstUserListResponse = await app.inject({
      method: "GET",
      url: "/v1/orders",
      headers: {
        "x-user-id": firstUserId
      }
    });
    const secondUserListResponse = await app.inject({
      method: "GET",
      url: "/v1/orders",
      headers: {
        "x-user-id": secondUserId
      }
    });

    expect(firstUserListResponse.statusCode).toBe(200);
    expect(secondUserListResponse.statusCode).toBe(200);
    expect(firstUserListResponse.json()).toEqual([expect.objectContaining({ id: firstOrder.order.id })]);
    expect(secondUserListResponse.json()).toEqual([expect.objectContaining({ id: secondOrder.order.id })]);

    await app.close();
  });

  it("preserves unscoped order history when x-user-id is not provided", async () => {
    const app = await buildApp();

    const firstOrder = await createQuotedOrder(app, {
      userId: "123e4567-e89b-12d3-a456-426614174011"
    });
    const secondOrder = await createQuotedOrder(app, {
      userId: "123e4567-e89b-12d3-a456-426614174012"
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/orders"
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstOrder.order.id }),
        expect.objectContaining({ id: secondOrder.order.id })
      ])
    );

    await app.close();
  });

  it("rejects quote requests with missing required customization groups", async () => {
    const app = await buildApp();

    const quoteResponse = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      payload: {
        locationId: "flagship-01",
        items: [
          {
            itemId: "latte",
            quantity: 1,
            customization: {
              selectedOptions: [{ groupId: "size", optionId: "regular" }],
              notes: ""
            }
          }
        ],
        pointsToRedeem: 0
      }
    });

    expect(quoteResponse.statusCode).toBe(400);
    expect(quoteResponse.json()).toMatchObject({
      code: "INVALID_CUSTOMIZATION"
    });

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
      headers: customerHeaders(),
      payload: createPayload
    });
    const secondCreate = await app.inject({
      method: "POST",
      url: "/v1/orders",
      headers: customerHeaders(),
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

  it("advances staff-controlled fulfillment states and emits notifications", async () => {
    vi.stubEnv("ORDER_FULFILLMENT_MODE", "staff");
    vi.stubEnv("ORDERS_INTERNAL_API_TOKEN", "orders-staff-token");
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
      headers: customerHeaders(),
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });
    const order = orderSchema.parse(createResponse.json());

    const payResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "staff-flow-pay"
      }
    });
    expect(payResponse.statusCode).toBe(200);

    const inPrepResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/status`,
      headers: {
        "x-internal-token": "orders-staff-token"
      },
      payload: {
        status: "IN_PREP"
      }
    });
    expect(inPrepResponse.statusCode).toBe(200);
    expect(orderSchema.parse(inPrepResponse.json()).status).toBe("IN_PREP");

    const readyResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/status`,
      headers: {
        "x-internal-token": "orders-staff-token"
      },
      payload: {
        status: "READY"
      }
    });
    expect(readyResponse.statusCode).toBe(200);
    expect(orderSchema.parse(readyResponse.json()).status).toBe("READY");

    const completedResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/status`,
      headers: {
        "x-internal-token": "orders-staff-token"
      },
      payload: {
        status: "COMPLETED"
      }
    });
    expect(completedResponse.statusCode).toBe(200);
    expect(orderSchema.parse(completedResponse.json()).status).toBe("COMPLETED");

    const notificationPayloads = fetchMock.mock.calls
      .filter(
        ([input, init]) =>
          (typeof input === "string" ? input : input.toString()).endsWith("/v1/notifications/internal/order-state") &&
          (init?.method ?? "GET") === "POST"
      )
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>)
      .filter((payload) => payload.orderId === order.id);

    expect(notificationPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "PAID" }),
        expect.objectContaining({ status: "IN_PREP" }),
        expect.objectContaining({ status: "READY" })
      ])
    );

    await app.close();
  });

  it("cancels and refunds a fulfilled order after it has progressed past payment", async () => {
    vi.stubEnv("ORDER_FULFILLMENT_MODE", "staff");
    vi.stubEnv("ORDERS_INTERNAL_API_TOKEN", "orders-staff-token");
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
      headers: customerHeaders(),
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });
    const order = orderSchema.parse(createResponse.json());

    await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "cancel-after-ready-pay"
      }
    });

    await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/status`,
      headers: {
        "x-internal-token": "orders-staff-token"
      },
      payload: {
        status: "IN_PREP"
      }
    });

    await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/status`,
      headers: {
        "x-internal-token": "orders-staff-token"
      },
      payload: {
        status: "READY"
      }
    });

    const cancelResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/cancel`,
      payload: { reason: "changed mind" }
    });
    expect(cancelResponse.statusCode).toBe(200);
    const canceledOrder = orderSchema.parse(cancelResponse.json());
    expect(canceledOrder.status).toBe("CANCELED");
    expect(canceledOrder.timeline.map((entry) => entry.status)).toEqual([
      "PENDING_PAYMENT",
      "PAID",
      "IN_PREP",
      "READY",
      "CANCELED"
    ]);

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
          idempotencyKey: `order:${order.id}:loyalty:redeem`
        }),
        expect.objectContaining({
          type: "EARN",
          idempotencyKey: `order:${order.id}:loyalty:earn`
        }),
        expect.objectContaining({
          type: "ADJUSTMENT",
          idempotencyKey: `order:${order.id}:loyalty:reverse-earn`
        }),
        expect.objectContaining({
          type: "REFUND",
          idempotencyKey: `order:${order.id}:loyalty:refund-redeem`
        })
      ])
    );

    await app.close();
  });

  it("attributes staff-triggered cancellations when the gateway forwards a staff cancel source", async () => {
    vi.stubEnv("ORDER_FULFILLMENT_MODE", "staff");
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
      headers: customerHeaders(),
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });
    const order = orderSchema.parse(createResponse.json());

    const payResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "staff-cancel-pay"
      }
    });
    expect(payResponse.statusCode).toBe(200);

    const cancelResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/cancel`,
      headers: {
        "x-order-cancel-source": "staff"
      },
      payload: { reason: "machine issue" }
    });
    expect(cancelResponse.statusCode).toBe(200);

    const canceledOrder = orderSchema.parse(cancelResponse.json());
    expect(canceledOrder.timeline.at(-1)).toMatchObject({
      status: "CANCELED",
      source: "staff",
      note: expect.stringContaining("Canceled by staff: machine issue.")
    });

    await app.close();
  });

  it("lazily reconciles fulfillment state forward on get and list reads when time-based mode is enabled", async () => {
    vi.stubEnv("ORDER_FULFILLMENT_MODE", "time_based");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T00:00:00.000Z"));

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
      headers: customerHeaders(),
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });
    const createdOrder = orderSchema.parse(createResponse.json());

    const payResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${createdOrder.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "pay-time-based-1"
      }
    });
    expect(payResponse.statusCode).toBe(200);
    expect(orderSchema.parse(payResponse.json()).status).toBe("PAID");

    vi.setSystemTime(new Date("2026-03-10T00:04:59.000Z"));
    const beforePrepResponse = await app.inject({
      method: "GET",
      url: `/v1/orders/${createdOrder.id}`
    });
    expect(orderSchema.parse(beforePrepResponse.json()).status).toBe("PAID");

    vi.setSystemTime(new Date("2026-03-10T00:05:00.000Z"));
    const inPrepResponse = await app.inject({
      method: "GET",
      url: `/v1/orders/${createdOrder.id}`
    });
    const inPrepOrder = orderSchema.parse(inPrepResponse.json());
    expect(inPrepOrder.status).toBe("IN_PREP");
    expect(inPrepOrder.timeline.map((entry) => entry.status)).toEqual([
      "PENDING_PAYMENT",
      "PAID",
      "IN_PREP"
    ]);

    vi.setSystemTime(new Date("2026-03-10T00:10:00.000Z"));
    const readyListResponse = await app.inject({
      method: "GET",
      url: "/v1/orders"
    });
    const readyList = orderSchema.array().parse(readyListResponse.json());
    const readyOrder = readyList.find((entry) => entry.id === createdOrder.id);
    expect(readyOrder).toMatchObject({
      id: createdOrder.id,
      status: "READY"
    });
    expect(readyOrder?.timeline.map((entry) => entry.status)).toEqual([
      "PENDING_PAYMENT",
      "PAID",
      "IN_PREP",
      "READY"
    ]);

    vi.setSystemTime(new Date("2026-03-10T00:15:00.000Z"));
    const completedResponse = await app.inject({
      method: "GET",
      url: `/v1/orders/${createdOrder.id}`
    });
    const completedOrder = orderSchema.parse(completedResponse.json());
    expect(completedOrder.status).toBe("COMPLETED");
    expect(completedOrder.timeline.map((entry) => entry.status)).toEqual([
      "PENDING_PAYMENT",
      "PAID",
      "IN_PREP",
      "READY",
      "COMPLETED"
    ]);

    const repeatedCompletedResponse = await app.inject({
      method: "GET",
      url: `/v1/orders/${createdOrder.id}`
    });
    const repeatedCompletedOrder = orderSchema.parse(repeatedCompletedResponse.json());
    expect(repeatedCompletedOrder.timeline).toHaveLength(completedOrder.timeline.length);

    await app.close();
  });

  it("does not auto-progress fulfillment on read when staff mode is enabled", async () => {
    vi.stubEnv("ORDER_FULFILLMENT_MODE", "staff");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T00:00:00.000Z"));

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
      headers: customerHeaders(),
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });
    const createdOrder = orderSchema.parse(createResponse.json());

    const payResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${createdOrder.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "pay-staff-mode-1"
      }
    });
    expect(payResponse.statusCode).toBe(200);

    vi.setSystemTime(new Date("2026-03-10T00:30:00.000Z"));
    const getResponse = await app.inject({
      method: "GET",
      url: `/v1/orders/${createdOrder.id}`
    });
    const orderAfterRead = orderSchema.parse(getResponse.json());
    expect(orderAfterRead.status).toBe("PAID");
    expect(orderAfterRead.timeline.map((entry) => entry.status)).toEqual(["PENDING_PAYMENT", "PAID"]);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/orders"
    });
    const orders = orderSchema.array().parse(listResponse.json());
    const listedOrder = orders.find((entry) => entry.id === createdOrder.id);
    expect(listedOrder?.status).toBe("PAID");
    expect(listedOrder?.timeline.map((entry) => entry.status)).toEqual(["PENDING_PAYMENT", "PAID"]);

    await app.close();
  });

  it("accepts structured Apple Pay wallet payloads for payment", async () => {
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
      headers: customerHeaders(),
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });
    const createdOrder = orderSchema.parse(createResponse.json());

    const payResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${createdOrder.id}/pay`,
      payload: {
        applePayWallet: {
          version: "EC_v1",
          data: "wallet-success-token",
          signature: "signature-value",
          header: {
            ephemeralPublicKey: "ephemeral-key",
            publicKeyHash: "public-key-hash",
            transactionId: "transaction-id"
          }
        },
        idempotencyKey: "wallet-pay-1"
      }
    });

    expect(payResponse.statusCode).toBe(200);
    expect(orderSchema.parse(payResponse.json()).status).toBe("PAID");

    const paymentChargeCalls = fetchMock.mock.calls.filter(([input]) =>
      (typeof input === "string" ? input : input.toString()).endsWith("/v1/payments/charges")
    );
    expect(paymentChargeCalls).toHaveLength(1);
    const chargeBody = JSON.parse(String(paymentChargeCalls[0]?.[1]?.body ?? "{}")) as Record<string, unknown>;
    expect(chargeBody).toMatchObject({
      idempotencyKey: "wallet-pay-1",
      applePayWallet: {
        version: "EC_v1"
      }
    });
    expect(chargeBody.applePayToken).toBeUndefined();

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
      headers: customerHeaders(),
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
      headers: customerHeaders(),
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
    const { order: declinedOrder } = await createQuotedOrder(app);

    const declined = await app.inject({
      method: "POST",
      url: `/v1/orders/${declinedOrder.id}/pay`,
      payload: {
        applePayToken: "apple-pay-decline-token",
        idempotencyKey: "pay-decline"
      }
    });
    expect(declined.statusCode).toBe(402);
    expect(declined.json()).toMatchObject({
      code: "PAYMENT_DECLINED",
      details: expect.objectContaining({
        orderId: declinedOrder.id,
        orderStatus: "CANCELED"
      })
    });

    const declinedOrderRead = await app.inject({
      method: "GET",
      url: `/v1/orders/${declinedOrder.id}`
    });
    expect(declinedOrderRead.statusCode).toBe(200);
    expect(orderSchema.parse(declinedOrderRead.json()).status).toBe("CANCELED");

    const { order: upstreamErrorOrder } = await createQuotedOrder(app, {
      userId: "123e4567-e89b-12d3-a456-426614174121"
    });

    const upstreamError = await app.inject({
      method: "POST",
      url: `/v1/orders/${upstreamErrorOrder.id}/pay`,
      payload: {
        applePayToken: "apple-pay-provider-error-token",
        idempotencyKey: "pay-provider-error"
      }
    });
    expect(upstreamError.statusCode).toBe(502);
    expect(upstreamError.json()).toMatchObject({
      code: "PAYMENTS_ERROR",
      details: expect.objectContaining({
        orderId: upstreamErrorOrder.id,
        orderStatus: "CANCELED"
      })
    });

    const upstreamErrorOrderRead = await app.inject({
      method: "GET",
      url: `/v1/orders/${upstreamErrorOrder.id}`
    });
    expect(upstreamErrorOrderRead.statusCode).toBe(200);
    expect(orderSchema.parse(upstreamErrorOrderRead.json()).status).toBe("CANCELED");

    const { order: timedOutOrder } = await createQuotedOrder(app, {
      userId: "123e4567-e89b-12d3-a456-426614174120"
    });

    const timedOut = await app.inject({
      method: "POST",
      url: `/v1/orders/${timedOutOrder.id}/pay`,
      payload: {
        applePayToken: "apple-pay-timeout-token",
        idempotencyKey: "pay-timeout"
      }
    });
    expect(timedOut.statusCode).toBe(504);
    expect(timedOut.json()).toMatchObject({ code: "PAYMENT_TIMEOUT" });

    const blockedRetry = await app.inject({
      method: "POST",
      url: `/v1/orders/${timedOutOrder.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "pay-timeout-retry"
      }
    });
    expect(blockedRetry.statusCode).toBe(409);
    expect(blockedRetry.json()).toMatchObject({
      code: "PAYMENT_RECONCILIATION_PENDING",
      details: expect.objectContaining({
        paymentId: "123e4567-e89b-12d3-a456-426614174102",
        status: "TIMEOUT"
      })
    });

    const getOrder = await app.inject({
      method: "GET",
      url: `/v1/orders/${timedOutOrder.id}`
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
      headers: customerHeaders(),
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
      headers: customerHeaders(),
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
      headers: customerHeaders(),
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

  it("applies internal payment and refund reconciliation webhooks idempotently", async () => {
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
      headers: customerHeaders(),
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });
    const order = orderSchema.parse(createResponse.json());
    const paymentId = "123e4567-e89b-12d3-a456-426614174310";

    const chargeReconcile = await app.inject({
      method: "POST",
      url: "/v1/orders/internal/payments/reconcile",
      headers: {
        "x-internal-token": "orders-internal-token"
      },
      payload: {
        eventId: "evt_charge_internal_1",
        provider: "CLOVER",
        kind: "CHARGE",
        orderId: order.id,
        paymentId,
        status: "SUCCEEDED",
        occurredAt: "2026-03-11T00:00:00.000Z",
        message: "Charge settled"
      }
    });
    expect(chargeReconcile.statusCode).toBe(200);
    expect(chargeReconcile.json()).toMatchObject({
      accepted: true,
      applied: true,
      orderStatus: "PAID"
    });

    const repeatedChargeReconcile = await app.inject({
      method: "POST",
      url: "/v1/orders/internal/payments/reconcile",
      headers: {
        "x-internal-token": "orders-internal-token"
      },
      payload: {
        eventId: "evt_charge_internal_1",
        provider: "CLOVER",
        kind: "CHARGE",
        orderId: order.id,
        paymentId,
        status: "SUCCEEDED",
        occurredAt: "2026-03-11T00:00:00.000Z",
        message: "Charge settled"
      }
    });
    expect(repeatedChargeReconcile.statusCode).toBe(200);
    expect(repeatedChargeReconcile.json()).toMatchObject({
      accepted: true,
      applied: false,
      orderStatus: "PAID"
    });

    const refundReconcile = await app.inject({
      method: "POST",
      url: "/v1/orders/internal/payments/reconcile",
      headers: {
        "x-internal-token": "orders-internal-token"
      },
      payload: {
        eventId: "evt_refund_internal_1",
        provider: "CLOVER",
        kind: "REFUND",
        orderId: order.id,
        paymentId,
        status: "REFUNDED",
        occurredAt: "2026-03-11T00:01:00.000Z",
        message: "Refund settled"
      }
    });
    expect(refundReconcile.statusCode).toBe(200);
    expect(refundReconcile.json()).toMatchObject({
      accepted: true,
      applied: true,
      orderStatus: "CANCELED"
    });

    const finalOrder = await app.inject({
      method: "GET",
      url: `/v1/orders/${order.id}`
    });
    expect(finalOrder.statusCode).toBe(200);
    expect(orderSchema.parse(finalOrder.json()).status).toBe("CANCELED");

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
          idempotencyKey: `order:${order.id}:loyalty:redeem`
        }),
        expect.objectContaining({
          type: "EARN",
          idempotencyKey: `order:${order.id}:loyalty:earn`
        }),
        expect.objectContaining({
          type: "ADJUSTMENT",
          idempotencyKey: `order:${order.id}:loyalty:reverse-earn`
        }),
        expect.objectContaining({
          type: "REFUND",
          idempotencyKey: `order:${order.id}:loyalty:refund-redeem`
        })
      ])
    );

    await app.close();
  });

  it("treats refund reconciliation for completed orders as a no-op instead of failing the webhook", async () => {
    vi.stubEnv("ORDER_FULFILLMENT_MODE", "staff");
    vi.stubEnv("ORDERS_INTERNAL_API_TOKEN", "orders-staff-token");
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
      headers: customerHeaders(),
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });
    const order = orderSchema.parse(createResponse.json());

    const payResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "completed-refund-pay"
      }
    });
    expect(payResponse.statusCode).toBe(200);

    for (const status of ["IN_PREP", "READY", "COMPLETED"] as const) {
      const transitionResponse = await app.inject({
        method: "POST",
        url: `/v1/orders/${order.id}/status`,
        headers: {
          "x-internal-token": "orders-staff-token"
        },
        payload: { status }
      });
      expect(transitionResponse.statusCode).toBe(200);
    }

    const refundReconcile = await app.inject({
      method: "POST",
      url: "/v1/orders/internal/payments/reconcile",
      headers: {
        "x-internal-token": "orders-staff-token"
      },
      payload: {
        eventId: "evt_refund_completed_1",
        provider: "CLOVER",
        kind: "REFUND",
        orderId: order.id,
        paymentId: "123e4567-e89b-12d3-a456-426614174333",
        refundId: "123e4567-e89b-12d3-a456-426614174444",
        status: "REFUNDED",
        occurredAt: "2026-03-11T00:05:00.000Z",
        message: "Refund settled after completion"
      }
    });
    expect(refundReconcile.statusCode).toBe(200);
    expect(refundReconcile.json()).toMatchObject({
      accepted: true,
      applied: false,
      orderStatus: "COMPLETED"
    });

    const finalOrder = await app.inject({
      method: "GET",
      url: `/v1/orders/${order.id}`
    });
    expect(finalOrder.statusCode).toBe(200);
    expect(orderSchema.parse(finalOrder.json()).status).toBe("COMPLETED");

    await app.close();
  });

  it("rejects internal reconciliation when token is configured and missing", async () => {
    vi.stubEnv("ORDERS_INTERNAL_API_TOKEN", "token-1");
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/orders/internal/payments/reconcile",
      payload: {
        provider: "CLOVER",
        kind: "CHARGE",
        orderId: "123e4567-e89b-12d3-a456-426614174311",
        paymentId: "123e4567-e89b-12d3-a456-426614174312",
        status: "SUCCEEDED",
        occurredAt: "2026-03-11T00:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED_INTERNAL_REQUEST" });
    await app.close();
  });

  it("allows staff-driven status updates when staff fulfillment mode is active", async () => {
    vi.stubEnv("ORDER_FULFILLMENT_MODE", "staff");
    const app = await buildApp();

    const quoteResponse = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      payload: sampleQuotePayload
    });
    expect(quoteResponse.statusCode).toBe(200);
    const quote = orderQuoteSchema.parse(quoteResponse.json());

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/orders",
      headers: customerHeaders(),
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });
    expect(createResponse.statusCode).toBe(200);
    const order = orderSchema.parse(createResponse.json());

    const payResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "staff-progress-success",
        idempotencyKey: "staff-progress-1"
      }
    });
    expect(payResponse.statusCode).toBe(200);
    expect(orderSchema.parse(payResponse.json()).status).toBe("PAID");

    const statusResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/status`,
      headers: {
        "x-internal-token": "orders-internal-token"
      },
      payload: {
        status: "IN_PREP",
        note: "Started by staff"
      }
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(orderSchema.parse(statusResponse.json())).toMatchObject({
      id: order.id,
      status: "IN_PREP"
    });

    await app.close();
  });

  it("rejects staff-driven status updates when time-based fulfillment mode is active", async () => {
    vi.stubEnv("ORDER_FULFILLMENT_MODE", "time_based");
    const app = await buildApp();

    const quoteResponse = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      payload: sampleQuotePayload
    });
    expect(quoteResponse.statusCode).toBe(200);
    const quote = orderQuoteSchema.parse(quoteResponse.json());

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/orders",
      headers: customerHeaders(),
      payload: {
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      }
    });
    expect(createResponse.statusCode).toBe(200);
    const order = orderSchema.parse(createResponse.json());

    const statusResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/status`,
      headers: {
        "x-internal-token": "orders-internal-token"
      },
      payload: {
        status: "IN_PREP",
        note: "Started by staff"
      }
    });

    expect(statusResponse.statusCode).toBe(409);
    expect(statusResponse.json()).toMatchObject({
      code: "STAFF_FULFILLMENT_DISABLED",
      details: {
        fulfillmentMode: "time_based"
      }
    });

    await app.close();
  });

  it("allows staff-driven cancel requests for unpaid orders when time-based fulfillment mode is active", async () => {
    vi.stubEnv("ORDER_FULFILLMENT_MODE", "time_based");
    const app = await buildApp();
    const { order } = await createQuotedOrder(app);

    const cancelResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/cancel`,
      headers: {
        "x-order-cancel-source": "staff"
      },
      payload: {
        reason: "Canceled by operator"
      }
    });

    expect(cancelResponse.statusCode).toBe(200);
    expect(orderSchema.parse(cancelResponse.json()).status).toBe("CANCELED");

    await app.close();
  });

  it("rejects staff-driven cancel requests for paid orders when time-based fulfillment mode is active", async () => {
    vi.stubEnv("ORDER_FULFILLMENT_MODE", "time_based");
    const app = await buildApp();
    const { order } = await createQuotedOrder(app, {
      userId: "123e4567-e89b-12d3-a456-426614174121"
    });

    const payResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/pay`,
      payload: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "pay-before-staff-cancel-block"
      }
    });
    expect(payResponse.statusCode).toBe(200);

    const cancelResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${order.id}/cancel`,
      headers: {
        "x-order-cancel-source": "staff"
      },
      payload: {
        reason: "Canceled by operator"
      }
    });

    expect(cancelResponse.statusCode).toBe(409);
    expect(cancelResponse.json()).toMatchObject({
      code: "STAFF_FULFILLMENT_DISABLED",
      details: {
        fulfillmentMode: "time_based"
      }
    });

    await app.close();
  });

  it("rate limits order write endpoints when configured threshold is reached", async () => {
    vi.stubEnv("ORDERS_RATE_LIMIT_WRITE_MAX", "1");
    vi.stubEnv("ORDERS_RATE_LIMIT_WINDOW_MS", "60000");
    const app = await buildApp();

    try {
      const firstQuote = await app.inject({
        method: "POST",
        url: "/v1/orders/quote",
        payload: sampleQuotePayload
      });
      expect(firstQuote.statusCode).toBe(200);

      const secondQuote = await app.inject({
        method: "POST",
        url: "/v1/orders/quote",
        payload: sampleQuotePayload
      });
      expect(secondQuote.statusCode).toBe(429);
    } finally {
      await app.close();
    }
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

  it("requires gateway token on customer routes when configured", async () => {
    vi.stubEnv("GATEWAY_INTERNAL_API_TOKEN", "orders-gateway-token");
    const app = await buildApp();

    const unauthorizedQuote = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      payload: sampleQuotePayload
    });
    expect(unauthorizedQuote.statusCode).toBe(401);
    expect(unauthorizedQuote.json()).toMatchObject({
      code: "UNAUTHORIZED_GATEWAY_REQUEST"
    });

    const authorizedQuote = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      headers: {
        "x-gateway-token": "orders-gateway-token"
      },
      payload: sampleQuotePayload
    });
    expect(authorizedQuote.statusCode).toBe(200);

    await app.close();
  });
});
