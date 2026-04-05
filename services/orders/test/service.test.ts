import type { FastifyBaseLogger } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_CONFIG_FULFILLMENT } from "@gazelle/contracts-catalog";
import type { OrdersRepository } from "../src/repository.js";
import { createOrdersRepository } from "../src/repository.js";
import {
  advanceOrderStatus,
  cancelOrder,
  createOrder,
  createQuote,
  processPayment,
  reconcilePaymentWebhook,
  type PosAdapter,
  type OrderServiceDeps
} from "../src/service.js";

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

const paymentsInternalToken = "orders-payments-token";
const loyaltyInternalToken = "orders-loyalty-token";
const notificationsInternalToken = "orders-notifications-token";
const defaultTestUserId = "123e4567-e89b-12d3-a456-426614174099";

function paymentsResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function createLoggerMock(): FastifyBaseLogger {
  const logger = {
    level: "info",
    fatal: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    child: vi.fn()
  } as unknown as FastifyBaseLogger;

  (logger.child as unknown as ReturnType<typeof vi.fn>).mockReturnValue(logger);
  return logger;
}

async function createTestDeps(
  repositories: OrdersRepository[],
  options: {
    fulfillmentMode?: "time_based" | "staff";
  } = {}
) {
  const logger = createLoggerMock();
  const repository = await createOrdersRepository(logger);
  repositories.push(repository);
  const submitOrder = vi.fn<PosAdapter["submitOrder"]>().mockResolvedValue(undefined);

  const deps: OrderServiceDeps = {
    repository,
    catalogBaseUrl: "http://catalog.test",
    paymentsBaseUrl: "http://payments.test",
    paymentsInternalToken,
    loyaltyBaseUrl: "http://loyalty.test",
    loyaltyInternalToken,
    notificationsBaseUrl: "http://notifications.test",
    notificationsInternalToken,
    posAdapter: {
      submitOrder
    },
    fulfillmentConfig: {
      ...DEFAULT_APP_CONFIG_FULFILLMENT,
      mode: options.fulfillmentMode ?? DEFAULT_APP_CONFIG_FULFILLMENT.mode
    },
    logger
  };

  return { deps, logger, submitOrder };
}

async function createQuotedOrder(
  deps: OrderServiceDeps,
  options: {
    requestId?: string;
    userId?: string;
  } = {}
) {
  const quoteResult = await createQuote({
    input: sampleQuotePayload,
    deps
  });
  if ("error" in quoteResult) {
    throw new Error(`Quote creation failed: ${quoteResult.error.code}`);
  }

  await deps.repository.saveQuote(quoteResult.quote);

  const orderResult = await createOrder({
    input: {
      quoteId: quoteResult.quote.quoteId,
      quoteHash: quoteResult.quote.quoteHash
    },
    requestId: options.requestId ?? "create-order-test",
    requestUserContext: { userId: options.userId ?? defaultTestUserId },
    deps
  });
  if ("error" in orderResult) {
    throw new Error(`Order creation failed: ${orderResult.error.code}`);
  }

  return {
    quote: quoteResult.quote,
    order: orderResult.order
  };
}

describe("orders service layer", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const repositories: OrdersRepository[] = [];
  let storeConfigIsOpen = true;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("DATABASE_URL", "");
    storeConfigIsOpen = true;

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

      if (url.endsWith("/v1/store/config") && method === "GET") {
        return paymentsResponse({
          locationId: "flagship-01",
          hoursText: "Daily · 7:00 AM - 6:00 PM",
          isOpen: storeConfigIsOpen,
          prepEtaMinutes: 12,
          taxRateBasisPoints: 600,
          pickupInstructions: "Pickup at the flagship order counter."
        });
      }

      if (url.endsWith("/v1/payments/charges") && method === "POST") {
        const headers = new Headers(init?.headers);
        expect(headers.get("x-internal-token")).toBe(paymentsInternalToken);
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
            occurredAt: "2026-03-10T00:00:30.000Z",
            message: "Clover timed out while confirming the charge"
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
        const headers = new Headers(init?.headers);
        expect(headers.get("x-internal-token")).toBe(paymentsInternalToken);
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
        const headers = new Headers(init?.headers);
        expect(headers.get("x-internal-token")).toBe(loyaltyInternalToken);
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
            id: "123e4567-e89b-12d3-a456-426614174401",
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
        const headers = new Headers(init?.headers);
        expect(headers.get("x-internal-token")).toBe(notificationsInternalToken);
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

      throw new Error(`Unhandled fetch in service test: ${method} ${url}`);
    });
  });

  afterEach(async () => {
    while (repositories.length > 0) {
      const repository = repositories.pop();
      await repository?.close();
    }

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("processPayment succeeds and advances the order to PAID", async () => {
    const userId = "123e4567-e89b-12d3-a456-426614174501";
    const { deps, submitOrder } = await createTestDeps(repositories);
    const { order } = await createQuotedOrder(deps, { userId });

    const result = await processPayment({
      orderId: order.id,
      input: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "service-pay-success"
      },
      requestId: "service-pay-success",
      requestUserContext: { userId },
      deps
    });

    expect("error" in result).toBe(false);
    if ("error" in result) {
      throw new Error(result.error.code);
    }

    expect(result.order.status).toBe("PAID");
    expect(result.order.timeline.map((entry) => entry.status)).toEqual(["PENDING_PAYMENT", "PAID"]);

    const persistedOrder = await deps.repository.getOrder(order.id);
    expect(persistedOrder?.status).toBe("PAID");

    const chargeCalls = fetchMock.mock.calls.filter(([input]) =>
      (typeof input === "string" ? input : input.toString()).endsWith("/v1/payments/charges")
    );
    expect(chargeCalls).toHaveLength(1);
    expect(submitOrder).toHaveBeenCalledTimes(1);
    expect(submitOrder).toHaveBeenCalledWith(expect.objectContaining({ id: order.id, status: "PAID" }));
  });

  it("processPayment cancels the order after a declined payment response", async () => {
    const userId = "123e4567-e89b-12d3-a456-426614174502";
    const { deps, submitOrder } = await createTestDeps(repositories);
    const { order } = await createQuotedOrder(deps, { userId });

    const result = await processPayment({
      orderId: order.id,
      input: {
        applePayToken: "apple-pay-decline-token",
        idempotencyKey: "service-pay-decline"
      },
      requestId: "service-pay-decline",
      requestUserContext: { userId },
      deps
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) {
      throw new Error("Expected declined payment error");
    }

    expect(result.error).toMatchObject({
      statusCode: 402,
      code: "PAYMENT_DECLINED",
      details: expect.objectContaining({
        orderId: order.id,
        orderStatus: "CANCELED"
      })
    });

    const persistedOrder = await deps.repository.getOrder(order.id);
    expect(persistedOrder?.status).toBe("CANCELED");
    expect(persistedOrder?.timeline.at(-1)).toMatchObject({
      status: "CANCELED",
      source: "system"
    });
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("processPayment blocks new payment attempts after a timeout until reconciliation lands", async () => {
    const userId = "123e4567-e89b-12d3-a456-426614174512";
    const { deps, submitOrder } = await createTestDeps(repositories);
    const { order } = await createQuotedOrder(deps, { userId });

    const timedOutResult = await processPayment({
      orderId: order.id,
      input: {
        applePayToken: "apple-pay-timeout-token",
        idempotencyKey: "service-pay-timeout"
      },
      requestId: "service-pay-timeout",
      requestUserContext: { userId },
      deps
    });

    expect("error" in timedOutResult).toBe(true);
    if (!("error" in timedOutResult)) {
      throw new Error("Expected timed out payment error");
    }
    expect(timedOutResult.error).toMatchObject({
      statusCode: 504,
      code: "PAYMENT_TIMEOUT"
    });

    const persistedCharge = await deps.repository.getSuccessfulCharge(order.id);
    expect(persistedCharge).toMatchObject({
      status: "TIMEOUT",
      paymentId: "123e4567-e89b-12d3-a456-426614174102"
    });

    const blockedRetry = await processPayment({
      orderId: order.id,
      input: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "service-pay-timeout-retry"
      },
      requestId: "service-pay-timeout-retry",
      requestUserContext: { userId },
      deps
    });

    expect("error" in blockedRetry).toBe(true);
    if (!("error" in blockedRetry)) {
      throw new Error("Expected pending reconciliation error");
    }
    expect(blockedRetry.error).toMatchObject({
      statusCode: 409,
      code: "PAYMENT_RECONCILIATION_PENDING",
      details: expect.objectContaining({
        paymentId: "123e4567-e89b-12d3-a456-426614174102",
        status: "TIMEOUT"
      })
    });

    const chargeCalls = fetchMock.mock.calls.filter(([input]) =>
      (typeof input === "string" ? input : input.toString()).endsWith("/v1/payments/charges")
    );
    expect(chargeCalls).toHaveLength(1);
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("reconcilePaymentWebhook submits order exactly once on paid transition", async () => {
    const userId = "123e4567-e89b-12d3-a456-426614174515";
    const { deps, submitOrder } = await createTestDeps(repositories);
    const { order } = await createQuotedOrder(deps, { userId });
    const paymentId = "123e4567-e89b-12d3-a456-426614174199";

    const result = await reconcilePaymentWebhook({
      input: {
        eventId: "evt_submit_order_once",
        provider: "CLOVER",
        kind: "CHARGE",
        orderId: order.id,
        paymentId,
        status: "SUCCEEDED",
        amountCents: order.total.amountCents,
        currency: "USD",
        occurredAt: "2026-03-11T00:00:00.000Z",
        message: "charge settled"
      },
      requestId: "service-reconcile-submit-order",
      deps
    });

    expect("error" in result).toBe(false);
    if ("error" in result) {
      throw new Error(result.error.code);
    }
    expect(result.result).toMatchObject({
      accepted: true,
      applied: true,
      orderStatus: "PAID"
    });
    expect(submitOrder).toHaveBeenCalledTimes(1);
    expect(submitOrder).toHaveBeenCalledWith(expect.objectContaining({ id: order.id, status: "PAID" }));
  });

  it("processPayment cancels the order after a definitive upstream payment error", async () => {
    const userId = "123e4567-e89b-12d3-a456-426614174514";
    const { deps } = await createTestDeps(repositories);
    const { order } = await createQuotedOrder(deps, { userId });

    const result = await processPayment({
      orderId: order.id,
      input: {
        applePayToken: "apple-pay-provider-error-token",
        idempotencyKey: "service-pay-provider-error"
      },
      requestId: "service-pay-provider-error",
      requestUserContext: { userId },
      deps
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) {
      throw new Error("Expected upstream payment error");
    }

    expect(result.error).toMatchObject({
      statusCode: 502,
      code: "PAYMENTS_ERROR",
      details: expect.objectContaining({
        orderId: order.id,
        orderStatus: "CANCELED"
      })
    });

    const persistedOrder = await deps.repository.getOrder(order.id);
    expect(persistedOrder?.status).toBe("CANCELED");
    expect(persistedOrder?.timeline.at(-1)).toMatchObject({
      status: "CANCELED",
      source: "system"
    });
  });

  it("cancelOrder cancels an unpaid order without issuing a refund", async () => {
    const userId = "123e4567-e89b-12d3-a456-426614174503";
    const { deps } = await createTestDeps(repositories);
    const { order } = await createQuotedOrder(deps, { userId });

    const result = await cancelOrder({
      orderId: order.id,
      input: { reason: "changed mind" },
      cancelSource: "customer",
      requestId: "service-cancel-pending",
      requestUserContext: { userId },
      deps
    });

    expect("error" in result).toBe(false);
    if ("error" in result) {
      throw new Error(result.error.code);
    }

    expect(result.order.status).toBe("CANCELED");

    const refundCalls = fetchMock.mock.calls.filter(([input]) =>
      (typeof input === "string" ? input : input.toString()).endsWith("/v1/payments/refunds")
    );
    expect(refundCalls).toHaveLength(0);
  });

  it("cancelOrder refunds a paid order and reverses loyalty side effects", async () => {
    const userId = "123e4567-e89b-12d3-a456-426614174504";
    const { deps } = await createTestDeps(repositories);
    const { order } = await createQuotedOrder(deps, { userId });

    const paidResult = await processPayment({
      orderId: order.id,
      input: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "service-paid-cancel-pay"
      },
      requestId: "service-paid-cancel-pay",
      requestUserContext: { userId },
      deps
    });
    expect("error" in paidResult).toBe(false);

    const cancelResult = await cancelOrder({
      orderId: order.id,
      input: { reason: "changed mind" },
      cancelSource: "customer",
      requestId: "service-paid-cancel",
      requestUserContext: { userId },
      deps
    });

    expect("error" in cancelResult).toBe(false);
    if ("error" in cancelResult) {
      throw new Error(cancelResult.error.code);
    }

    expect(cancelResult.order.status).toBe("CANCELED");

    const refundCalls = fetchMock.mock.calls.filter(([input]) =>
      (typeof input === "string" ? input : input.toString()).endsWith("/v1/payments/refunds")
    );
    expect(refundCalls).toHaveLength(1);

    const loyaltyCalls = fetchMock.mock.calls
      .filter(([input]) => (typeof input === "string" ? input : input.toString()).endsWith("/v1/loyalty/internal/ledger/apply"))
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);

    expect(loyaltyCalls).toEqual(
      expect.arrayContaining([
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
  });

  it("cancelOrder persists rejected refund responses for support follow-up", async () => {
    const userId = "123e4567-e89b-12d3-a456-426614174513";
    const { deps } = await createTestDeps(repositories);
    const { order } = await createQuotedOrder(deps, { userId });

    const paidResult = await processPayment({
      orderId: order.id,
      input: {
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "service-paid-reject-refund-pay"
      },
      requestId: "service-paid-reject-refund-pay",
      requestUserContext: { userId },
      deps
    });
    expect("error" in paidResult).toBe(false);

    const cancelResult = await cancelOrder({
      orderId: order.id,
      input: { reason: "please reject refund" },
      cancelSource: "customer",
      requestId: "service-paid-reject-refund",
      requestUserContext: { userId },
      deps
    });

    expect("error" in cancelResult).toBe(true);
    if (!("error" in cancelResult)) {
      throw new Error("Expected rejected refund error");
    }
    expect(cancelResult.error).toMatchObject({
      statusCode: 409,
      code: "REFUND_REJECTED"
    });

    const persistedRefund = await deps.repository.getSuccessfulRefund(order.id);
    expect(persistedRefund).toMatchObject({
      status: "REJECTED"
    });
  });

  it("advanceOrderStatus rejects invalid transitions", async () => {
    const { deps } = await createTestDeps(repositories, { fulfillmentMode: "staff" });
    const { order } = await createQuotedOrder(deps);

    const result = await advanceOrderStatus({
      orderId: order.id,
      input: {
        status: "READY",
        note: "skip ahead"
      },
      requestId: "service-invalid-transition",
      deps
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) {
      throw new Error("Expected invalid transition error");
    }

    expect(result.error).toMatchObject({
      statusCode: 409,
      code: "ORDER_TRANSITION_INVALID"
    });
  });

  it("advanceOrderStatus is blocked when fulfillment mode is not staff", async () => {
    const { deps } = await createTestDeps(repositories, { fulfillmentMode: "time_based" });
    const { order } = await createQuotedOrder(deps);

    const result = await advanceOrderStatus({
      orderId: order.id,
      input: {
        status: "IN_PREP",
        note: "start prep"
      },
      requestId: "service-fulfillment-blocked",
      deps
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) {
      throw new Error("Expected fulfillment-mode error");
    }

    expect(result.error).toMatchObject({
      statusCode: 409,
      code: "STAFF_FULFILLMENT_DISABLED",
      details: {
        fulfillmentMode: "time_based"
      }
    });
  });

  it("allows staff to cancel an unpaid order even when fulfillment mode is not staff", async () => {
    const { deps } = await createTestDeps(repositories, { fulfillmentMode: "time_based" });
    const { order } = await createQuotedOrder(deps);

    const result = await cancelOrder({
      orderId: order.id,
      input: { reason: "operator canceled unpaid order" },
      cancelSource: "staff",
      requestId: "service-staff-cancel-pending",
      deps
    });

    expect("error" in result).toBe(false);
    if ("error" in result) {
      throw new Error(result.error.code);
    }

    expect(result.order.status).toBe("CANCELED");
    expect(result.order.timeline.at(-1)).toMatchObject({
      status: "CANCELED",
      source: "staff"
    });
  });

  it("rejects createOrder when request user context is missing", async () => {
    const { deps } = await createTestDeps(repositories);
    const quoteResult = await createQuote({
      input: sampleQuotePayload,
      deps
    });
    if ("error" in quoteResult) {
      throw new Error(`Quote creation failed: ${quoteResult.error.code}`);
    }

    await deps.repository.saveQuote(quoteResult.quote);

    const result = await createOrder({
      input: {
        quoteId: quoteResult.quote.quoteId,
        quoteHash: quoteResult.quote.quoteHash
      },
      requestId: "missing-user-context",
      deps
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) {
      throw new Error("Expected missing user context error");
    }

    expect(result.error).toMatchObject({
      statusCode: 400,
      code: "INVALID_USER_CONTEXT"
    });
  });

  it("rejects createOrder when the user already has an active order", async () => {
    const { deps } = await createTestDeps(repositories);
    const initialQuoteResult = await createQuote({
      input: sampleQuotePayload,
      deps
    });
    if ("error" in initialQuoteResult) {
      throw new Error(`Quote creation failed: ${initialQuoteResult.error.code}`);
    }

    await deps.repository.saveQuote(initialQuoteResult.quote);

    const initialOrderResult = await createOrder({
      input: {
        quoteId: initialQuoteResult.quote.quoteId,
        quoteHash: initialQuoteResult.quote.quoteHash
      },
      requestId: "first-active-order",
      requestUserContext: { userId: defaultTestUserId },
      deps
    });
    if ("error" in initialOrderResult) {
      throw new Error(`Initial order creation failed: ${initialOrderResult.error.code}`);
    }

    const secondQuoteResult = await createQuote({
      input: {
        ...sampleQuotePayload,
        pointsToRedeem: 0
      },
      deps
    });
    if ("error" in secondQuoteResult) {
      throw new Error(`Second quote creation failed: ${secondQuoteResult.error.code}`);
    }

    await deps.repository.saveQuote(secondQuoteResult.quote);

    const secondOrderResult = await createOrder({
      input: {
        quoteId: secondQuoteResult.quote.quoteId,
        quoteHash: secondQuoteResult.quote.quoteHash
      },
      requestId: "reject-second-active-order",
      requestUserContext: { userId: defaultTestUserId },
      deps
    });

    expect("error" in secondOrderResult).toBe(true);
    if (!("error" in secondOrderResult)) {
      throw new Error("Expected active order conflict");
    }

    expect(secondOrderResult.error).toMatchObject({
      statusCode: 409,
      code: "ACTIVE_ORDER_EXISTS",
      details: {
        orderId: initialOrderResult.order.id,
        status: "PENDING_PAYMENT",
        pickupCode: initialOrderResult.order.pickupCode
      }
    });
  });

  it("rejects quote and createOrder when the store is closed", async () => {
    const { deps } = await createTestDeps(repositories);

    storeConfigIsOpen = false;
    const closedQuoteResult = await createQuote({
      input: sampleQuotePayload,
      deps
    });
    expect("error" in closedQuoteResult).toBe(true);
    if (!("error" in closedQuoteResult)) {
      throw new Error("Expected closed-store quote error");
    }
    expect(closedQuoteResult.error.code).toBe("STORE_CLOSED");

    storeConfigIsOpen = true;
    const openQuoteResult = await createQuote({
      input: sampleQuotePayload,
      deps
    });
    if ("error" in openQuoteResult) {
      throw new Error(`Quote creation failed: ${openQuoteResult.error.code}`);
    }

    await deps.repository.saveQuote(openQuoteResult.quote);

    storeConfigIsOpen = false;
    const closedCreateResult = await createOrder({
      input: {
        quoteId: openQuoteResult.quote.quoteId,
        quoteHash: openQuoteResult.quote.quoteHash
      },
      requestId: "closed-store-create-order",
      requestUserContext: { userId: defaultTestUserId },
      deps
    });

    expect("error" in closedCreateResult).toBe(true);
    if (!("error" in closedCreateResult)) {
      throw new Error("Expected closed-store createOrder error");
    }
    expect(closedCreateResult.error.code).toBe("STORE_CLOSED");
  });
});
