import type { FastifyBaseLogger } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_CONFIG_FULFILLMENT } from "@lattelink/contracts-catalog";
import type { OrdersRepository } from "../src/repository.js";
import { createOrdersRepository } from "../src/repository.js";
import {
  advanceOrderStatus,
  cancelOrder,
  createOrder,
  createQuote,
  getOrderForRead,
  listOrdersForRead,
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
    fulfillmentModeByLocation?: Record<string, "time_based" | "staff">;
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
    getFulfillmentConfig: async (locationId) => ({
      ...DEFAULT_APP_CONFIG_FULFILLMENT,
      mode:
        (locationId ? options.fulfillmentModeByLocation?.[locationId] : undefined) ??
        options.fulfillmentMode ??
        DEFAULT_APP_CONFIG_FULFILLMENT.mode
    }),
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

      const parsedUrl = new URL(url);
      if (parsedUrl.pathname === "/v1/store/config" && method === "GET") {
        expect(parsedUrl.searchParams.get("locationId")).toBe("flagship-01");
        return paymentsResponse({
          locationId: "flagship-01",
          hoursText: "Daily · 7:00 AM - 6:00 PM",
          isOpen: storeConfigIsOpen,
          nextOpenAt: storeConfigIsOpen ? null : "2026-03-10T07:00:00.000Z",
          prepEtaMinutes: 12,
          taxRateBasisPoints: 600,
          pickupInstructions: "Pickup at the flagship order counter."
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
        const locationId = String(body.locationId ?? "flagship-01");
        const idempotencyKey = String(body.idempotencyKey ?? "");
        const mutationType = String(body.type ?? "");
        const idempotencyScope = `${userId}:${locationId}:${idempotencyKey}`;
        const fingerprint = JSON.stringify({
          type: mutationType,
          locationId,
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

        const balanceKey = `${userId}:${locationId}`;
        const balance = loyaltyBalances.get(balanceKey) ?? {
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
        loyaltyBalances.set(balanceKey, nextBalance);

        const response = {
          entry: {
            id: "123e4567-e89b-12d3-a456-426614174401",
            type: mutationType,
            points: deltaPoints,
            orderId: body.orderId,
            locationId,
            createdAt: "2026-03-10T00:03:00.000Z"
          },
          balance: {
            userId,
            locationId,
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

  it("reconcilePaymentWebhook does not create a separate Clover order on paid transition", async () => {
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
    expect(submitOrder).not.toHaveBeenCalled();
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

    const paidResult = await reconcilePaymentWebhook({
      input: {
        eventId: "evt-paid-cancel-pay",
        provider: "STRIPE",
        kind: "CHARGE",
        orderId: order.id,
        paymentId: "123e4567-e89b-12d3-a456-426614174100",
        status: "SUCCEEDED",
        amountCents: order.total.amountCents,
        currency: "USD",
        occurredAt: "2026-03-10T00:00:00.000Z"
      },
      requestId: "service-paid-cancel-pay",
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

  it("getOrderForRead hides orders outside the requested operator location", async () => {
    const { deps } = await createTestDeps(repositories);
    const { order } = await createQuotedOrder(deps);

    const result = await getOrderForRead({
      orderId: order.id,
      locationId: "northside-01",
      requestId: "service-read-wrong-location",
      deps
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) {
      throw new Error("Expected order lookup failure");
    }

    expect(result.error).toMatchObject({
      statusCode: 404,
      code: "ORDER_NOT_FOUND",
      details: {
        orderId: order.id,
        locationId: "northside-01"
      }
    });
  });

  it("hydrates customer details onto operator order lists", async () => {
    const order = {
      id: "123e4567-e89b-12d3-a456-426614174201",
      locationId: "flagship-01",
      status: "PAID" as const,
      items: [],
      total: { currency: "USD" as const, amountCents: 530 },
      pickupCode: "PAID01",
      timeline: [
        {
          status: "PAID" as const,
          occurredAt: "2026-04-24T12:00:00.000Z"
        }
      ]
    };
    const repository: OrdersRepository = {
      backend: "memory",
      saveQuote: vi.fn(),
      getQuote: vi.fn(),
      createOrder: vi.fn(),
      getOrder: vi.fn().mockResolvedValue(order),
      listOrders: vi.fn().mockResolvedValue([order]),
      listOrdersByUser: vi.fn().mockResolvedValue([]),
      listOrdersByLocation: vi.fn().mockResolvedValue([order]),
      getOrderForCreateIdempotency: vi.fn(),
      saveCreateOrderIdempotency: vi.fn(),
      getPaymentOrderByIdempotency: vi.fn(),
      savePaymentIdempotency: vi.fn(),
      getOrderQuote: vi.fn(),
      getOrderUserId: vi.fn().mockResolvedValue(defaultTestUserId),
      getOrderCustomer: vi.fn().mockResolvedValue({
        name: "Avery Quinn",
        email: "avery@example.com",
        phone: "+13135550123"
      }),
      listOrderCustomers: vi.fn().mockResolvedValue(
        new Map([
          [
            order.id,
            {
              name: "Avery Quinn",
              email: "avery@example.com",
              phone: "+13135550123"
            }
          ]
        ])
      ),
      setOrderUserId: vi.fn(),
      setPaymentId: vi.fn(),
      getPaymentId: vi.fn(),
      setSuccessfulCharge: vi.fn(),
      getSuccessfulCharge: vi.fn(),
      setSuccessfulRefund: vi.fn(),
      getSuccessfulRefund: vi.fn(),
      updateOrder: vi.fn().mockImplementation(async (_orderId, nextOrder) => nextOrder),
      getCatalogItemsForQuote: vi.fn().mockResolvedValue(new Map()),
      getTaxRateBasisPoints: vi.fn().mockResolvedValue(600),
      pingDb: vi.fn(),
      close: vi.fn()
    };
    const deps: OrderServiceDeps = {
      repository,
      catalogBaseUrl: "http://catalog.test",
      paymentsBaseUrl: "http://payments.test",
      loyaltyBaseUrl: "http://loyalty.test",
      notificationsBaseUrl: "http://notifications.test",
      getFulfillmentConfig: async () => ({
        ...DEFAULT_APP_CONFIG_FULFILLMENT,
        mode: "staff"
      }),
      logger: createLoggerMock()
    };

    const result = await listOrdersForRead({
      requestId: "list-orders-customer-hydration",
      locationId: "flagship-01",
      deps
    });

    expect(result.orders).toEqual([
      expect.objectContaining({
        id: order.id,
        customer: {
          name: "Avery Quinn",
          email: "avery@example.com",
          phone: "+13135550123"
        }
      })
    ]);
  });

  it("hydrates customer details onto single operator order reads", async () => {
    const order = {
      id: "123e4567-e89b-12d3-a456-426614174202",
      locationId: "flagship-01",
      status: "PAID" as const,
      items: [],
      total: { currency: "USD" as const, amountCents: 530 },
      pickupCode: "PAID02",
      timeline: [
        {
          status: "PAID" as const,
          occurredAt: "2026-04-24T12:00:00.000Z"
        }
      ]
    };
    const repository: OrdersRepository = {
      backend: "memory",
      saveQuote: vi.fn(),
      getQuote: vi.fn(),
      createOrder: vi.fn(),
      getOrder: vi.fn().mockResolvedValue(order),
      listOrders: vi.fn().mockResolvedValue([]),
      listOrdersByUser: vi.fn().mockResolvedValue([]),
      listOrdersByLocation: vi.fn().mockResolvedValue([]),
      getOrderForCreateIdempotency: vi.fn(),
      saveCreateOrderIdempotency: vi.fn(),
      getPaymentOrderByIdempotency: vi.fn(),
      savePaymentIdempotency: vi.fn(),
      getOrderQuote: vi.fn(),
      getOrderUserId: vi.fn().mockResolvedValue(defaultTestUserId),
      getOrderCustomer: vi.fn().mockResolvedValue({
        name: "Avery Quinn",
        email: "avery@example.com"
      }),
      listOrderCustomers: vi.fn().mockResolvedValue(new Map()),
      setOrderUserId: vi.fn(),
      setPaymentId: vi.fn(),
      getPaymentId: vi.fn(),
      setSuccessfulCharge: vi.fn(),
      getSuccessfulCharge: vi.fn(),
      setSuccessfulRefund: vi.fn(),
      getSuccessfulRefund: vi.fn(),
      updateOrder: vi.fn().mockImplementation(async (_orderId, nextOrder) => nextOrder),
      getCatalogItemsForQuote: vi.fn().mockResolvedValue(new Map()),
      getTaxRateBasisPoints: vi.fn().mockResolvedValue(600),
      pingDb: vi.fn(),
      close: vi.fn()
    };
    const deps: OrderServiceDeps = {
      repository,
      catalogBaseUrl: "http://catalog.test",
      paymentsBaseUrl: "http://payments.test",
      loyaltyBaseUrl: "http://loyalty.test",
      notificationsBaseUrl: "http://notifications.test",
      getFulfillmentConfig: async () => ({
        ...DEFAULT_APP_CONFIG_FULFILLMENT,
        mode: "staff"
      }),
      logger: createLoggerMock()
    };

    const result = await getOrderForRead({
      orderId: order.id,
      locationId: "flagship-01",
      requestId: "get-order-customer-hydration",
      deps
    });

    expect("error" in result).toBe(false);
    if ("error" in result) {
      throw new Error(`Unexpected error: ${result.error.code}`);
    }
    expect(result.order).toMatchObject({
      id: order.id,
      customer: {
        name: "Avery Quinn",
        email: "avery@example.com"
      }
    });
  });

  it("reconciles fulfillment by order location so staff-based stores do not auto-progress", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T00:30:00.000Z"));

    const staffOrder = {
      id: "123e4567-e89b-12d3-a456-426614174301",
      locationId: "staff-01",
      status: "PAID" as const,
      items: [],
      total: { currency: "USD" as const, amountCents: 525 },
      pickupCode: "STAFF1",
      timeline: [
        {
          status: "PENDING_PAYMENT" as const,
          occurredAt: "2026-03-10T00:00:00.000Z",
          source: "customer" as const,
          note: "Order created"
        },
        {
          status: "PAID" as const,
          occurredAt: "2026-03-10T00:00:30.000Z",
          source: "customer" as const,
          note: "Payment accepted"
        }
      ]
    };
    const timeBasedOrder = {
      id: "123e4567-e89b-12d3-a456-426614174302",
      locationId: "time-01",
      status: "PAID" as const,
      items: [],
      total: { currency: "USD" as const, amountCents: 725 },
      pickupCode: "TIME01",
      timeline: [
        {
          status: "PENDING_PAYMENT" as const,
          occurredAt: "2026-03-10T00:00:00.000Z",
          source: "customer" as const,
          note: "Order created"
        },
        {
          status: "PAID" as const,
          occurredAt: "2026-03-10T00:00:30.000Z",
          source: "customer" as const,
          note: "Payment accepted"
        }
      ]
    };

    const repository = {
      listOrders: vi.fn().mockResolvedValue([staffOrder, timeBasedOrder]),
      listOrdersByLocation: vi.fn(),
      listOrdersByUser: vi.fn(),
      getOrder: vi.fn(),
      saveQuote: vi.fn(),
      getQuote: vi.fn(),
      saveOrder: vi.fn(),
      saveOrderUserId: vi.fn(),
      getOrderUserId: vi.fn().mockResolvedValue(defaultTestUserId),
      savePaymentIdempotency: vi.fn(),
      getOrderByPaymentIdempotency: vi.fn(),
      saveRefundIdempotency: vi.fn(),
      getOrderByRefundIdempotency: vi.fn(),
      saveChargeAttempt: vi.fn(),
      getChargeAttempt: vi.fn(),
      saveRefundAttempt: vi.fn(),
      getRefundAttempt: vi.fn(),
      setPaymentId: vi.fn(),
      getPaymentId: vi.fn(),
      setSuccessfulCharge: vi.fn(),
      getSuccessfulCharge: vi.fn(),
      setSuccessfulRefund: vi.fn(),
      getSuccessfulRefund: vi.fn(),
      updateOrder: vi.fn().mockImplementation(async (_orderId, nextOrder) => nextOrder),
      getCatalogItemsForQuote: vi.fn().mockResolvedValue(new Map()),
      getTaxRateBasisPoints: vi.fn().mockResolvedValue(600),
      getOrderCustomer: vi.fn().mockResolvedValue(undefined),
      listOrderCustomers: vi.fn().mockResolvedValue(new Map()),
      pingDb: vi.fn(),
      close: vi.fn()
    } as unknown as OrdersRepository;

    const deps: OrderServiceDeps = {
      repository,
      catalogBaseUrl: "http://catalog.test",
      paymentsBaseUrl: "http://payments.test",
      loyaltyBaseUrl: "http://loyalty.test",
      notificationsBaseUrl: "http://notifications.test",
      getFulfillmentConfig: async (locationId) => ({
        ...DEFAULT_APP_CONFIG_FULFILLMENT,
        mode: locationId === "staff-01" ? "staff" : "time_based"
      }),
      logger: createLoggerMock()
    };

    const result = await listOrdersForRead({
      requestId: "list-orders-location-fulfillment",
      deps
    });

    const listedStaffOrder = result.orders.find((order) => order.id === staffOrder.id);
    const listedTimeBasedOrder = result.orders.find((order) => order.id === timeBasedOrder.id);

    expect(listedStaffOrder?.status).toBe("PAID");
    expect(listedStaffOrder?.timeline.map((entry) => entry.status)).toEqual(["PENDING_PAYMENT", "PAID"]);
    expect(listedTimeBasedOrder?.status).toBe("COMPLETED");
    expect(listedTimeBasedOrder?.timeline.map((entry) => entry.status)).toEqual([
      "PENDING_PAYMENT",
      "PAID",
      "IN_PREP",
      "READY",
      "COMPLETED"
    ]);
    expect(repository.updateOrder).toHaveBeenCalledTimes(1);
    expect(repository.updateOrder).toHaveBeenCalledWith(timeBasedOrder.id, expect.objectContaining({ status: "COMPLETED" }));
  });

  it("cancelOrder persists rejected refund responses for support follow-up", async () => {
    const userId = "123e4567-e89b-12d3-a456-426614174513";
    const { deps } = await createTestDeps(repositories);
    const { order } = await createQuotedOrder(deps, { userId });

    const paidResult = await reconcilePaymentWebhook({
      input: {
        eventId: "evt-paid-reject-refund-pay",
        provider: "STRIPE",
        kind: "CHARGE",
        orderId: order.id,
        paymentId: "123e4567-e89b-12d3-a456-426614174100",
        status: "SUCCEEDED",
        amountCents: order.total.amountCents,
        currency: "USD",
        occurredAt: "2026-03-10T00:00:00.000Z"
      },
      requestId: "service-paid-reject-refund-pay",
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

  it("advanceOrderStatus hides orders outside the requested operator location", async () => {
    const { deps } = await createTestDeps(repositories, { fulfillmentMode: "staff" });
    const { order } = await createQuotedOrder(deps);

    const result = await advanceOrderStatus({
      orderId: order.id,
      input: {
        status: "IN_PREP",
        note: "start prep"
      },
      locationId: "northside-01",
      requestId: "service-status-wrong-location",
      deps
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) {
      throw new Error("Expected order lookup failure");
    }

    expect(result.error).toMatchObject({
      statusCode: 404,
      code: "ORDER_NOT_FOUND",
      details: {
        orderId: order.id,
        locationId: "northside-01"
      }
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

  it("allows staff to cancel a paid order when fulfillment mode is staff", async () => {
    const { deps } = await createTestDeps(repositories, { fulfillmentMode: "staff" });
    const { order } = await createQuotedOrder(deps, {
      userId: "123e4567-e89b-12d3-a456-426614174333"
    });

    const paymentResult = await reconcilePaymentWebhook({
      input: {
        eventId: "evt-staff-cancel-paid-pay",
        provider: "STRIPE",
        kind: "CHARGE",
        orderId: order.id,
        paymentId: "123e4567-e89b-12d3-a456-426614174100",
        status: "SUCCEEDED",
        amountCents: order.total.amountCents,
        currency: "USD",
        occurredAt: "2026-03-10T00:00:00.000Z"
      },
      requestId: "service-staff-cancel-paid-pay",
      deps
    });
    if ("error" in paymentResult) {
      throw new Error(`Expected payment success, received ${paymentResult.error.code}`);
    }

    const result = await cancelOrder({
      orderId: order.id,
      input: { reason: "operator canceled paid order" },
      cancelSource: "staff",
      requestId: "service-staff-cancel-paid",
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

  it("cancelOrder accepts provider-style payment ids for paid refunds", async () => {
    const { deps } = await createTestDeps(repositories, { fulfillmentMode: "staff" });
    const { order } = await createQuotedOrder(deps, {
      userId: "123e4567-e89b-12d3-a456-426614174334"
    });

    const paymentResult = await reconcilePaymentWebhook({
      input: {
        eventId: "evt-provider-payment-id-pay",
        provider: "STRIPE",
        kind: "CHARGE",
        orderId: order.id,
        paymentId: "123e4567-e89b-12d3-a456-426614174100",
        status: "SUCCEEDED",
        amountCents: order.total.amountCents,
        currency: "USD",
        occurredAt: "2026-03-10T00:00:00.000Z"
      },
      requestId: "service-provider-payment-id-pay",
      deps
    });
    if ("error" in paymentResult) {
      throw new Error(`Expected payment success, received ${paymentResult.error.code}`);
    }

    vi.spyOn(deps.repository, "getPaymentId").mockResolvedValue("pi_live_provider_payment_id");

    const result = await cancelOrder({
      orderId: order.id,
      input: { reason: "operator canceled paid order with provider payment id" },
      cancelSource: "staff",
      requestId: "service-provider-payment-id-cancel",
      deps
    });

    expect("error" in result).toBe(false);
    if ("error" in result) {
      throw new Error(result.error.code);
    }

    const refundCalls = fetchMock.mock.calls.filter(([input]) =>
      (typeof input === "string" ? input : input.toString()).endsWith("/v1/payments/refunds")
    );
    expect(refundCalls).toHaveLength(1);
    expect(JSON.parse(String(refundCalls[0]?.[1]?.body))).toMatchObject({
      orderId: order.id,
      paymentId: "pi_live_provider_payment_id"
    });
    expect(result.order.status).toBe("CANCELED");
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

  it("supersedes a stale unpaid order when the user starts a new checkout", async () => {
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

    expect("error" in secondOrderResult).toBe(false);
    if ("error" in secondOrderResult) {
      throw new Error(`Unexpected second order error: ${secondOrderResult.error.code}`);
    }

    expect(secondOrderResult.order.id).not.toBe(initialOrderResult.order.id);
    const supersededOrder = await deps.repository.getOrder(initialOrderResult.order.id);
    expect(supersededOrder?.status).toBe("CANCELED");
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
    expect(closedQuoteResult.error).toMatchObject({
      statusCode: 409,
      code: "STORE_CLOSED",
      message: "The store is currently closed"
    });

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
    expect(closedCreateResult.error).toMatchObject({
      statusCode: 409,
      code: "STORE_CLOSED",
      message: "The store is currently closed"
    });
  });
});
