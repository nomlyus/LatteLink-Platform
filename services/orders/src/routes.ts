import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  applePayWalletSchema,
  createOrderRequestSchema,
  ordersPaymentReconciliationResultSchema,
  ordersPaymentReconciliationSchema,
  orderQuoteSchema,
  orderSchema,
  payOrderRequestSchema,
  quoteRequestSchema
} from "@gazelle/contracts-orders";
import { z } from "zod";
import { createOrdersRepository, type OrdersRepository } from "./repository.js";

const payloadSchema = z.object({
  id: z.string().uuid().optional()
});

const notificationOrderStatusSchema = z.enum([
  "PENDING_PAYMENT",
  "PAID",
  "IN_PREP",
  "READY",
  "COMPLETED",
  "CANCELED"
]);

const orderStateNotificationSchema = z.object({
  userId: z.string().uuid(),
  orderId: z.string().uuid(),
  status: notificationOrderStatusSchema,
  pickupCode: z.string().min(1),
  locationId: z.string().min(1),
  occurredAt: z.string().datetime(),
  note: z.string().optional()
});

const orderStateDispatchResponseSchema = z.object({
  accepted: z.literal(true),
  enqueued: z.number().int().nonnegative(),
  deduplicated: z.boolean()
});

const orderIdParamsSchema = z.object({
  orderId: z.string().uuid()
});

const cancelOrderRequestSchema = z.object({
  reason: z.string().min(1)
});

const serviceErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  details: z.record(z.unknown()).optional()
});

const userHeadersSchema = z.object({
  "x-user-id": z.string().uuid().optional()
});

const internalHeadersSchema = z.object({
  "x-internal-token": z.string().optional()
});

const paymentsChargeRequestSchema = z.object({
  orderId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  currency: z.literal("USD"),
  applePayToken: z.string().min(1).optional(),
  applePayWallet: applePayWalletSchema.optional(),
  idempotencyKey: z.string().min(1)
}).superRefine((input, context) => {
  const hasToken = Boolean(input.applePayToken);
  const hasWallet = Boolean(input.applePayWallet);

  if (!hasToken && !hasWallet) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["applePayToken"],
      message: "Either applePayToken or applePayWallet is required."
    });
  }

  if (hasToken && hasWallet) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["applePayWallet"],
      message: "Provide either applePayToken or applePayWallet, but not both."
    });
  }
});

const paymentsChargeStatusSchema = z.enum(["SUCCEEDED", "DECLINED", "TIMEOUT"]);

const paymentsChargeResponseSchema = z.object({
  paymentId: z.string().uuid(),
  provider: z.literal("CLOVER"),
  orderId: z.string().uuid(),
  status: paymentsChargeStatusSchema,
  approved: z.boolean(),
  amountCents: z.number().int().positive(),
  currency: z.literal("USD"),
  occurredAt: z.string().datetime(),
  declineCode: z.string().optional(),
  message: z.string().optional()
});

const paymentsRefundRequestSchema = z.object({
  orderId: z.string().uuid(),
  paymentId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  currency: z.literal("USD"),
  reason: z.string().min(1),
  idempotencyKey: z.string().min(1)
});

const paymentsRefundResponseSchema = z.object({
  refundId: z.string().uuid(),
  provider: z.literal("CLOVER"),
  orderId: z.string().uuid(),
  paymentId: z.string().uuid(),
  status: z.enum(["REFUNDED", "REJECTED"]),
  amountCents: z.number().int().positive(),
  currency: z.literal("USD"),
  occurredAt: z.string().datetime(),
  message: z.string().optional()
});

const loyaltyBalanceSchema = z.object({
  userId: z.string().uuid(),
  availablePoints: z.number().int().nonnegative(),
  pendingPoints: z.number().int().nonnegative(),
  lifetimeEarned: z.number().int().nonnegative()
});

const loyaltyLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["EARN", "REDEEM", "REFUND", "ADJUSTMENT"]),
  points: z.number().int(),
  orderId: z.string().uuid().optional(),
  createdAt: z.string().datetime()
});

const loyaltyMutationBaseSchema = z.object({
  userId: z.string().uuid(),
  orderId: z.string().uuid(),
  idempotencyKey: z.string().min(1)
});

const loyaltyMutationRequestSchema = z.union([
  loyaltyMutationBaseSchema.extend({
    type: z.literal("EARN"),
    amountCents: z.number().int().positive()
  }),
  loyaltyMutationBaseSchema.extend({
    type: z.literal("REDEEM"),
    amountCents: z.number().int().positive()
  }),
  loyaltyMutationBaseSchema.extend({
    type: z.literal("REFUND"),
    amountCents: z.number().int().positive()
  }),
  loyaltyMutationBaseSchema.extend({
    type: z.literal("ADJUSTMENT"),
    points: z.number().int().refine((value) => value !== 0, {
      message: "adjustment points cannot be zero"
    })
  })
]);

const loyaltyMutationResponseSchema = z.object({
  entry: loyaltyLedgerEntrySchema,
  balance: loyaltyBalanceSchema
});

const unitPriceByItemId: Record<string, number> = {
  latte: 675,
  "cold-brew": 550,
  croissant: 425,
  matcha: 725
};

const fallbackUnitPriceCents = 500;
const taxRateBasisPoints = 600;
const defaultRateLimitWindowMs = 60_000;
const defaultOrdersWriteRateLimitMax = 120;
const defaultOrdersInternalReconcileRateLimitMax = 180;

type OrderQuote = z.output<typeof orderQuoteSchema>;
type Order = z.output<typeof orderSchema>;

const defaultLoyaltyUserId = "123e4567-e89b-12d3-a456-426614174000";

function trimToUndefined(value: string | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

function toPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function toRefundIdempotencyKey(orderId: string, reason: string) {
  const normalizedReason = reason.trim().toLowerCase();
  const reasonFingerprint = createHash("sha256").update(normalizedReason).digest("hex").slice(0, 16);
  return `cancel:${orderId}:${reasonFingerprint}`;
}

function toLoyaltyIdempotencyKey(orderId: string, action: string) {
  return `order:${orderId}:loyalty:${action}`;
}

function sendError(
  reply: FastifyReply,
  input: {
    statusCode: number;
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  }
) {
  return reply.status(input.statusCode).send(
    serviceErrorSchema.parse({
      code: input.code,
      message: input.message,
      requestId: input.requestId,
      details: input.details
    })
  );
}

function parseJsonSafely(rawBody: string): unknown {
  if (!rawBody) {
    return undefined;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return rawBody;
  }
}

function resolveRequestUserId(request: FastifyRequest, reply: FastifyReply) {
  const parsedHeaders = userHeadersSchema.safeParse(request.headers);
  if (!parsedHeaders.success) {
    request.log.warn(
      {
        requestId: request.id,
        details: parsedHeaders.error.flatten()
      },
      "invalid x-user-id header"
    );
    sendError(reply, {
      statusCode: 400,
      code: "INVALID_USER_CONTEXT",
      message: "x-user-id header must be a UUID when provided",
      requestId: request.id,
      details: parsedHeaders.error.flatten()
    });
    return undefined;
  }

  return parsedHeaders.data["x-user-id"] ?? defaultLoyaltyUserId;
}

function authorizeInternalRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  internalToken: string | undefined
) {
  if (!internalToken) {
    return true;
  }

  const parsedHeaders = internalHeadersSchema.safeParse(request.headers);
  const providedToken = parsedHeaders.success ? parsedHeaders.data["x-internal-token"] : undefined;
  if (providedToken === internalToken) {
    return true;
  }

  sendError(reply, {
    statusCode: 401,
    code: "UNAUTHORIZED_INTERNAL_REQUEST",
    message: "Internal reconciliation token is invalid",
    requestId: request.id
  });
  return false;
}

async function applyLoyaltyMutation(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  loyaltyBaseUrl: string;
  mutation: z.output<typeof loyaltyMutationRequestSchema>;
  failureCode: string;
  failureMessage: string;
}) {
  const { request, reply, loyaltyBaseUrl, mutation, failureCode, failureMessage } = params;

  let loyaltyResponse: Response;
  try {
    loyaltyResponse = await fetch(`${loyaltyBaseUrl}/v1/loyalty/internal/ledger/apply`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": request.id
      },
      body: JSON.stringify(mutation)
    });
  } catch {
    sendError(reply, {
      statusCode: 502,
      code: failureCode,
      message: failureMessage,
      requestId: request.id
    });
    return undefined;
  }

  const parsedLoyaltyBody = parseJsonSafely(await loyaltyResponse.text());
  if (!loyaltyResponse.ok) {
    sendError(reply, {
      statusCode: 502,
      code: failureCode,
      message: `${failureMessage} (status ${loyaltyResponse.status})`,
      requestId: request.id,
      details: {
        upstreamStatus: loyaltyResponse.status,
        upstreamBody: parsedLoyaltyBody
      }
    });
    return undefined;
  }

  const parsedLoyaltyMutation = loyaltyMutationResponseSchema.safeParse(parsedLoyaltyBody);
  if (!parsedLoyaltyMutation.success) {
    sendError(reply, {
      statusCode: 502,
      code: "LOYALTY_INVALID_RESPONSE",
      message: "Loyalty service returned an invalid mutation response",
      requestId: request.id,
      details: parsedLoyaltyMutation.error.flatten()
    });
    return undefined;
  }

  return parsedLoyaltyMutation.data;
}

async function sendOrderStateNotification(params: {
  request: FastifyRequest;
  notificationsBaseUrl: string;
  userId: string;
  order: Order;
}) {
  const { request, notificationsBaseUrl, userId, order } = params;
  const latestTimelineEntry = order.timeline[order.timeline.length - 1];
  const payload = orderStateNotificationSchema.parse({
    userId,
    orderId: order.id,
    status: order.status,
    pickupCode: order.pickupCode,
    locationId: order.locationId,
    occurredAt: latestTimelineEntry?.occurredAt ?? new Date().toISOString(),
    note: latestTimelineEntry?.note
  });

  let response: Response;
  try {
    response = await fetch(`${notificationsBaseUrl}/v1/notifications/internal/order-state`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": request.id
      },
      body: JSON.stringify(payload)
    });
  } catch {
    request.log.warn(
      { orderId: order.id, status: order.status, userId },
      "notifications service unavailable while dispatching order-state event"
    );
    return;
  }

  const parsedBody = parseJsonSafely(await response.text());
  if (!response.ok) {
    request.log.warn(
      {
        orderId: order.id,
        status: order.status,
        userId,
        upstreamStatus: response.status,
        upstreamBody: parsedBody
      },
      "notifications service rejected order-state event"
    );
    return;
  }

  const parsedDispatch = orderStateDispatchResponseSchema.safeParse(parsedBody);
  if (!parsedDispatch.success) {
    request.log.warn(
      {
        orderId: order.id,
        status: order.status,
        userId,
        upstreamBody: parsedBody,
        details: parsedDispatch.error.flatten()
      },
      "notifications service returned invalid order-state response"
    );
    return;
  }
}

async function resolveStoredOrderUserId(params: {
  orderId: string;
  repository: OrdersRepository;
}) {
  const { orderId, repository } = params;
  const existingUserId = await repository.getOrderUserId(orderId);
  if (existingUserId) {
    return existingUserId;
  }

  await repository.setOrderUserId(orderId, defaultLoyaltyUserId);
  return defaultLoyaltyUserId;
}

function buildQuoteHash(input: {
  locationId: string;
  items: Array<{ itemId: string; quantity: number; unitPriceCents: number }>;
  pointsToRedeem: number;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}) {
  const sortedItems = [...input.items].sort((left, right) => left.itemId.localeCompare(right.itemId));
  const hashPayload = JSON.stringify({
    locationId: input.locationId,
    pointsToRedeem: input.pointsToRedeem,
    subtotalCents: input.subtotalCents,
    discountCents: input.discountCents,
    taxCents: input.taxCents,
    totalCents: input.totalCents,
    items: sortedItems
  });

  return createHash("sha256").update(hashPayload).digest("hex");
}

function getItemUnitPriceCents(itemId: string) {
  return unitPriceByItemId[itemId] ?? fallbackUnitPriceCents;
}

function createQuote(input: z.output<typeof quoteRequestSchema>): OrderQuote {
  const quotedItems = input.items.map((item) => ({
    itemId: item.itemId,
    quantity: item.quantity,
    unitPriceCents: getItemUnitPriceCents(item.itemId)
  }));
  const subtotalCents = quotedItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const appliedPoints = Math.min(input.pointsToRedeem, subtotalCents);
  const taxBaseCents = subtotalCents - appliedPoints;
  const taxCents = Math.round((taxBaseCents * taxRateBasisPoints) / 10_000);
  const totalCents = taxBaseCents + taxCents;

  return orderQuoteSchema.parse({
    quoteId: randomUUID(),
    locationId: input.locationId,
    items: quotedItems,
    subtotal: { currency: "USD", amountCents: subtotalCents },
    discount: { currency: "USD", amountCents: appliedPoints },
    tax: { currency: "USD", amountCents: taxCents },
    total: { currency: "USD", amountCents: totalCents },
    pointsToRedeem: appliedPoints,
    quoteHash: buildQuoteHash({
      locationId: input.locationId,
      items: quotedItems,
      pointsToRedeem: appliedPoints,
      subtotalCents,
      discountCents: appliedPoints,
      taxCents,
      totalCents
    })
  });
}

function buildPickupCode(seed: string) {
  return createHash("sha256").update(seed).digest("hex").slice(0, 6).toUpperCase();
}

function appendOrderStatus(order: Order, status: z.output<typeof orderSchema>["status"], note?: string): Order {
  return orderSchema.parse({
    ...order,
    status,
    timeline: [
      ...order.timeline,
      {
        status,
        occurredAt: new Date().toISOString(),
        ...(note ? { note } : {})
      }
    ]
  });
}

function createOrderFromQuote(quote: OrderQuote): Order {
  const orderId = randomUUID();

  return orderSchema.parse({
    id: orderId,
    locationId: quote.locationId,
    status: "PENDING_PAYMENT",
    items: quote.items,
    total: quote.total,
    pickupCode: buildPickupCode(orderId),
    timeline: [
      {
        status: "PENDING_PAYMENT",
        occurredAt: new Date().toISOString(),
        note: "Order created from quote"
      }
    ]
  });
}

export async function registerRoutes(app: FastifyInstance) {
  const paymentsBaseUrl = process.env.PAYMENTS_SERVICE_BASE_URL ?? "http://127.0.0.1:3003";
  const loyaltyBaseUrl = process.env.LOYALTY_SERVICE_BASE_URL ?? "http://127.0.0.1:3004";
  const notificationsBaseUrl = process.env.NOTIFICATIONS_SERVICE_BASE_URL ?? "http://127.0.0.1:3005";
  const internalApiToken = trimToUndefined(process.env.ORDERS_INTERNAL_API_TOKEN);
  const ordersRateLimitWindowMs = toPositiveInteger(process.env.ORDERS_RATE_LIMIT_WINDOW_MS, defaultRateLimitWindowMs);
  const ordersWriteRateLimit = {
    max: toPositiveInteger(process.env.ORDERS_RATE_LIMIT_WRITE_MAX, defaultOrdersWriteRateLimitMax),
    timeWindow: ordersRateLimitWindowMs
  };
  const ordersInternalReconcileRateLimit = {
    max: toPositiveInteger(
      process.env.ORDERS_RATE_LIMIT_INTERNAL_RECONCILE_MAX,
      defaultOrdersInternalReconcileRateLimitMax
    ),
    timeWindow: ordersRateLimitWindowMs
  };
  const repository = await createOrdersRepository(app.log);

  app.addHook("onClose", async () => {
    await repository.close();
  });

  app.get("/health", async () => ({ status: "ok", service: "orders" }));
  app.get("/ready", async () => ({ status: "ready", service: "orders", persistence: repository.backend }));

  app.post(
    "/v1/orders/internal/payments/reconcile",
    {
      preHandler: app.rateLimit(ordersInternalReconcileRateLimit)
    },
    async (request, reply) => {
      if (!authorizeInternalRequest(request, reply, internalApiToken)) {
        return;
      }

    const input = ordersPaymentReconciliationSchema.parse(request.body);
    const existingOrder = await repository.getOrder(input.orderId);
    if (!existingOrder) {
      return sendError(reply, {
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
        message: "Order not found",
        requestId: request.id,
        details: { orderId: input.orderId }
      });
    }

    await repository.setPaymentId(input.orderId, input.paymentId);

    if (input.kind === "CHARGE") {
      const chargeSnapshot = paymentsChargeResponseSchema.parse({
        paymentId: input.paymentId,
        provider: "CLOVER",
        orderId: input.orderId,
        status: input.status,
        approved: input.status === "SUCCEEDED",
        amountCents: input.amountCents ?? existingOrder.total.amountCents,
        currency: input.currency ?? existingOrder.total.currency,
        occurredAt: input.occurredAt,
        declineCode: input.declineCode,
        message: input.message
      });
      await repository.setSuccessfulCharge(input.orderId, chargeSnapshot);

      if (input.status !== "SUCCEEDED") {
        return ordersPaymentReconciliationResultSchema.parse({
          accepted: true,
          applied: false,
          orderStatus: existingOrder.status,
          note: `Charge status ${input.status} does not transition order state`
        });
      }

      if (existingOrder.status !== "PENDING_PAYMENT") {
        return ordersPaymentReconciliationResultSchema.parse({
          accepted: true,
          applied: false,
          orderStatus: existingOrder.status,
          note: "Order is already settled for payment reconciliation"
        });
      }

      const orderQuote = await repository.getOrderQuote(input.orderId);
      if (!orderQuote) {
        return sendError(reply, {
          statusCode: 409,
          code: "ORDER_CONTEXT_MISSING",
          message: "Order quote context is missing",
          requestId: request.id,
          details: { orderId: input.orderId }
        });
      }

      const orderUserId = await resolveStoredOrderUserId({ orderId: input.orderId, repository });
      if (orderQuote.pointsToRedeem > 0) {
        const redeemMutation = loyaltyMutationRequestSchema.parse({
          type: "REDEEM",
          userId: orderUserId,
          orderId: input.orderId,
          amountCents: orderQuote.pointsToRedeem,
          idempotencyKey: toLoyaltyIdempotencyKey(input.orderId, "redeem")
        });
        const redeemResult = await applyLoyaltyMutation({
          request,
          reply,
          loyaltyBaseUrl,
          mutation: redeemMutation,
          failureCode: "LOYALTY_REDEEM_FAILED",
          failureMessage: "Loyalty redeem mutation failed"
        });
        if (!redeemResult) {
          return;
        }
      }

      const earnMutation = loyaltyMutationRequestSchema.parse({
        type: "EARN",
        userId: orderUserId,
        orderId: input.orderId,
        amountCents: existingOrder.total.amountCents,
        idempotencyKey: toLoyaltyIdempotencyKey(input.orderId, "earn")
      });
      const earnResult = await applyLoyaltyMutation({
        request,
        reply,
        loyaltyBaseUrl,
        mutation: earnMutation,
        failureCode: "LOYALTY_EARN_FAILED",
        failureMessage: "Loyalty earn mutation failed"
      });
      if (!earnResult) {
        return;
      }

      const loyaltyParts = [
        orderQuote.pointsToRedeem > 0 ? `redeemed ${orderQuote.pointsToRedeem} loyalty points` : undefined,
        `earned ${existingOrder.total.amountCents} loyalty points`
      ].filter((value): value is string => Boolean(value));
      const eventNote = input.eventId ? `event ${input.eventId}` : "webhook event";
      const paidOrder = appendOrderStatus(
        existingOrder,
        "PAID",
        `Payment reconciled from Clover ${eventNote}; ${loyaltyParts.join("; ")}.`
      );
      await repository.updateOrder(input.orderId, paidOrder);
      await sendOrderStateNotification({
        request,
        notificationsBaseUrl,
        userId: orderUserId,
        order: paidOrder
      });

      return ordersPaymentReconciliationResultSchema.parse({
        accepted: true,
        applied: true,
        orderStatus: paidOrder.status
      });
    }

    const existingPersistedRefund = await repository.getSuccessfulRefund(input.orderId);
    const parsedPersistedRefund =
      existingPersistedRefund === undefined ? undefined : paymentsRefundResponseSchema.safeParse(existingPersistedRefund);
    const refundIdFromStore = parsedPersistedRefund?.success ? parsedPersistedRefund.data.refundId : undefined;
    const refundSnapshot = paymentsRefundResponseSchema.parse({
      refundId: input.refundId ?? refundIdFromStore ?? randomUUID(),
      provider: "CLOVER",
      orderId: input.orderId,
      paymentId: input.paymentId,
      status: input.status,
      amountCents: input.amountCents ?? existingOrder.total.amountCents,
      currency: input.currency ?? existingOrder.total.currency,
      occurredAt: input.occurredAt,
      message: input.message
    });
    await repository.setSuccessfulRefund(input.orderId, refundSnapshot);

    if (input.status !== "REFUNDED") {
      return ordersPaymentReconciliationResultSchema.parse({
        accepted: true,
        applied: false,
        orderStatus: existingOrder.status,
        note: `Refund status ${input.status} does not transition order state`
      });
    }

    if (existingOrder.status !== "PAID") {
      return ordersPaymentReconciliationResultSchema.parse({
        accepted: true,
        applied: false,
        orderStatus: existingOrder.status,
        note: "Order is not in PAID state for refund reconciliation"
      });
    }

    const orderQuote = await repository.getOrderQuote(input.orderId);
    if (!orderQuote) {
      return sendError(reply, {
        statusCode: 409,
        code: "ORDER_CONTEXT_MISSING",
        message: "Order quote context is missing",
        requestId: request.id,
        details: { orderId: input.orderId }
      });
    }

    const orderUserId = await resolveStoredOrderUserId({ orderId: input.orderId, repository });
    const reverseEarnMutation = loyaltyMutationRequestSchema.parse({
      type: "ADJUSTMENT",
      userId: orderUserId,
      orderId: input.orderId,
      points: -existingOrder.total.amountCents,
      idempotencyKey: toLoyaltyIdempotencyKey(input.orderId, "reverse-earn")
    });
    const reverseEarnResult = await applyLoyaltyMutation({
      request,
      reply,
      loyaltyBaseUrl,
      mutation: reverseEarnMutation,
      failureCode: "LOYALTY_REVERSAL_FAILED",
      failureMessage: "Loyalty earn reversal failed"
    });
    if (!reverseEarnResult) {
      return;
    }

    if (orderQuote.pointsToRedeem > 0) {
      const refundRedeemMutation = loyaltyMutationRequestSchema.parse({
        type: "REFUND",
        userId: orderUserId,
        orderId: input.orderId,
        amountCents: orderQuote.pointsToRedeem,
        idempotencyKey: toLoyaltyIdempotencyKey(input.orderId, "refund-redeem")
      });
      const refundRedeemResult = await applyLoyaltyMutation({
        request,
        reply,
        loyaltyBaseUrl,
        mutation: refundRedeemMutation,
        failureCode: "LOYALTY_REVERSAL_FAILED",
        failureMessage: "Loyalty redeem refund failed"
      });
      if (!refundRedeemResult) {
        return;
      }
    }

    const reversalParts = [
      `reversed ${existingOrder.total.amountCents} earned points`,
      orderQuote.pointsToRedeem > 0 ? `refunded ${orderQuote.pointsToRedeem} redeemed points` : undefined
    ].filter((value): value is string => Boolean(value));
    const eventNote = input.eventId ? `event ${input.eventId}` : "webhook event";
    const canceledOrder = appendOrderStatus(
      existingOrder,
      "CANCELED",
      `Refund reconciled from Clover ${eventNote}; ${reversalParts.join("; ")}.`
    );
    await repository.updateOrder(input.orderId, canceledOrder);
    await sendOrderStateNotification({
      request,
      notificationsBaseUrl,
      userId: orderUserId,
      order: canceledOrder
    });

      return ordersPaymentReconciliationResultSchema.parse({
        accepted: true,
        applied: true,
        orderStatus: canceledOrder.status
      });
    }
  );

  app.post(
    "/v1/orders/quote",
    {
      preHandler: app.rateLimit(ordersWriteRateLimit)
    },
    async (request) => {
      const input = quoteRequestSchema.parse(request.body);
      const quote = createQuote(input);

      await repository.saveQuote(quote);
      return quote;
    }
  );

  app.post(
    "/v1/orders",
    {
      preHandler: app.rateLimit(ordersWriteRateLimit)
    },
    async (request, reply) => {
      const input = createOrderRequestSchema.parse(request.body);
      const quote = await repository.getQuote(input.quoteId);

    if (!quote) {
      return sendError(reply, {
        statusCode: 404,
        code: "QUOTE_NOT_FOUND",
        message: "Quote not found",
        requestId: request.id,
        details: { quoteId: input.quoteId }
      });
    }

    if (quote.quoteHash !== input.quoteHash) {
      return sendError(reply, {
        statusCode: 409,
        code: "QUOTE_HASH_MISMATCH",
        message: "Quote hash does not match current quote",
        requestId: request.id,
        details: { quoteId: input.quoteId }
      });
    }

    const requestUserId = resolveRequestUserId(request, reply);
    if (!requestUserId) {
      return;
    }

    const existingOrder = await repository.getOrderForCreateIdempotency(input.quoteId, input.quoteHash);
    if (existingOrder) {
      return existingOrder;
    }

    const order = createOrderFromQuote(quote);
    await repository.createOrder({
      order,
      quoteId: quote.quoteId,
      userId: requestUserId
    });
    await repository.saveCreateOrderIdempotency(input.quoteId, input.quoteHash, order.id);
    await sendOrderStateNotification({
      request,
      notificationsBaseUrl,
      userId: requestUserId,
      order
    });

      return order;
    }
  );

  app.post(
    "/v1/orders/:orderId/pay",
    {
      preHandler: app.rateLimit(ordersWriteRateLimit)
    },
    async (request, reply) => {
      const { orderId } = orderIdParamsSchema.parse(request.params);
      const input = payOrderRequestSchema.parse(request.body);
      const existingOrder = await repository.getOrder(orderId);

    if (!existingOrder) {
      return sendError(reply, {
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
        message: "Order not found",
        requestId: request.id,
        details: { orderId }
      });
    }

    if (existingOrder.status === "CANCELED") {
      return sendError(reply, {
        statusCode: 409,
        code: "ORDER_NOT_PAYABLE",
        message: "Canceled orders cannot be paid",
        requestId: request.id,
        details: { orderId, status: existingOrder.status }
      });
    }

    const existingPaymentResult = await repository.getPaymentOrderByIdempotency(orderId, input.idempotencyKey);

    if (existingPaymentResult) {
      return existingPaymentResult;
    }

    if (existingOrder.status !== "PENDING_PAYMENT") {
      return existingOrder;
    }

    const orderQuote = await repository.getOrderQuote(orderId);
    if (!orderQuote) {
      return sendError(reply, {
        statusCode: 409,
        code: "ORDER_CONTEXT_MISSING",
        message: "Order quote context is missing",
        requestId: request.id,
        details: { orderId }
      });
    }

    let orderUserId = await repository.getOrderUserId(orderId);
    if (!orderUserId) {
      const fallbackUserId = resolveRequestUserId(request, reply);
      if (!fallbackUserId) {
        return;
      }
      orderUserId = fallbackUserId;
      await repository.setOrderUserId(orderId, fallbackUserId);
    }

    const persistedCharge = await repository.getSuccessfulCharge(orderId);
    let successfulCharge: z.output<typeof paymentsChargeResponseSchema> | undefined;
    if (persistedCharge !== undefined) {
      const parsedPersistedCharge = paymentsChargeResponseSchema.safeParse(persistedCharge);
      if (parsedPersistedCharge.success && parsedPersistedCharge.data.status === "SUCCEEDED") {
        successfulCharge = parsedPersistedCharge.data;
      }
    }
    if (!successfulCharge) {
      const chargeRequestPayload = paymentsChargeRequestSchema.parse({
        orderId,
        amountCents: existingOrder.total.amountCents,
        currency: existingOrder.total.currency,
        applePayToken: input.applePayToken,
        applePayWallet: input.applePayWallet,
        idempotencyKey: input.idempotencyKey
      });

      let chargeResponse: Response;
      try {
        chargeResponse = await fetch(`${paymentsBaseUrl}/v1/payments/charges`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": request.id
          },
          body: JSON.stringify(chargeRequestPayload)
        });
      } catch {
        return sendError(reply, {
          statusCode: 502,
          code: "PAYMENTS_UNAVAILABLE",
          message: "Payments service is unavailable",
          requestId: request.id
        });
      }

      const parsedChargeBody = parseJsonSafely(await chargeResponse.text());

      if (!chargeResponse.ok) {
        return sendError(reply, {
          statusCode: 502,
          code: "PAYMENTS_ERROR",
          message: `Payments charge request failed with status ${chargeResponse.status}`,
          requestId: request.id,
          details: { upstreamBody: parsedChargeBody }
        });
      }

      const parsedCharge = paymentsChargeResponseSchema.safeParse(parsedChargeBody);
      if (!parsedCharge.success) {
        return sendError(reply, {
          statusCode: 502,
          code: "PAYMENTS_INVALID_RESPONSE",
          message: "Payments service returned an invalid charge response",
          requestId: request.id,
          details: parsedCharge.error.flatten()
        });
      }

      if (parsedCharge.data.status === "DECLINED") {
        return sendError(reply, {
          statusCode: 402,
          code: "PAYMENT_DECLINED",
          message: parsedCharge.data.message ?? "Payment was declined",
          requestId: request.id,
          details: {
            paymentId: parsedCharge.data.paymentId,
            provider: parsedCharge.data.provider,
            declineCode: parsedCharge.data.declineCode
          }
        });
      }

      if (parsedCharge.data.status === "TIMEOUT") {
        return sendError(reply, {
          statusCode: 504,
          code: "PAYMENT_TIMEOUT",
          message: parsedCharge.data.message ?? "Payment timed out",
          requestId: request.id,
          details: {
            paymentId: parsedCharge.data.paymentId,
            provider: parsedCharge.data.provider
          }
        });
      }

      successfulCharge = parsedCharge.data;
      await repository.setSuccessfulCharge(orderId, successfulCharge);
    }

    if (orderQuote.pointsToRedeem > 0) {
      const redeemMutation = loyaltyMutationRequestSchema.parse({
        type: "REDEEM",
        userId: orderUserId,
        orderId,
        amountCents: orderQuote.pointsToRedeem,
        idempotencyKey: toLoyaltyIdempotencyKey(orderId, "redeem")
      });
      const redeemResult = await applyLoyaltyMutation({
        request,
        reply,
        loyaltyBaseUrl,
        mutation: redeemMutation,
        failureCode: "LOYALTY_REDEEM_FAILED",
        failureMessage: "Loyalty redeem mutation failed"
      });
      if (!redeemResult) {
        return;
      }
    }

    const earnMutation = loyaltyMutationRequestSchema.parse({
      type: "EARN",
      userId: orderUserId,
      orderId,
      amountCents: existingOrder.total.amountCents,
      idempotencyKey: toLoyaltyIdempotencyKey(orderId, "earn")
    });
    const earnResult = await applyLoyaltyMutation({
      request,
      reply,
      loyaltyBaseUrl,
      mutation: earnMutation,
      failureCode: "LOYALTY_EARN_FAILED",
      failureMessage: "Loyalty earn mutation failed"
    });
    if (!earnResult) {
      return;
    }

    const loyaltyParts = [
      orderQuote.pointsToRedeem > 0 ? `redeemed ${orderQuote.pointsToRedeem} loyalty points` : undefined,
      `earned ${existingOrder.total.amountCents} loyalty points`
    ].filter((value): value is string => Boolean(value));

    const paidOrder = appendOrderStatus(existingOrder, "PAID", `Clover payment accepted; ${loyaltyParts.join("; ")}.`);
    await repository.updateOrder(orderId, paidOrder);
    await repository.setPaymentId(orderId, successfulCharge.paymentId);
    await repository.savePaymentIdempotency(orderId, input.idempotencyKey);
    await sendOrderStateNotification({
      request,
      notificationsBaseUrl,
      userId: orderUserId,
      order: paidOrder
    });

      return paidOrder;
    }
  );

  app.get("/v1/orders", async () => {
    const orders = await repository.listOrders();
    return z.array(orderSchema).parse(orders);
  });

  app.get("/v1/orders/:orderId", async (request, reply) => {
    const { orderId } = orderIdParamsSchema.parse(request.params);
    const order = await repository.getOrder(orderId);

    if (!order) {
      return sendError(reply, {
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
        message: "Order not found",
        requestId: request.id,
        details: { orderId }
      });
    }

    return orderSchema.parse(order);
  });

  app.post(
    "/v1/orders/:orderId/cancel",
    {
      preHandler: app.rateLimit(ordersWriteRateLimit)
    },
    async (request, reply) => {
      const { orderId } = orderIdParamsSchema.parse(request.params);
      const input = cancelOrderRequestSchema.parse(request.body);
      const existingOrder = await repository.getOrder(orderId);

    if (!existingOrder) {
      return sendError(reply, {
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
        message: "Order not found",
        requestId: request.id,
        details: { orderId }
      });
    }

    if (existingOrder.status === "COMPLETED") {
      return sendError(reply, {
        statusCode: 409,
        code: "ORDER_NOT_CANCELABLE",
        message: "Completed orders cannot be canceled",
        requestId: request.id,
        details: { orderId, status: existingOrder.status }
      });
    }

    if (existingOrder.status === "CANCELED") {
      return existingOrder;
    }

    let refundNote = "";
    if (existingOrder.status === "PAID") {
      const paymentId = await repository.getPaymentId(orderId);
      if (!paymentId) {
        return sendError(reply, {
          statusCode: 409,
          code: "REFUND_REFERENCE_MISSING",
          message: "Unable to locate payment reference for refund",
          requestId: request.id,
          details: { orderId }
        });
      }

      const orderQuote = await repository.getOrderQuote(orderId);
      if (!orderQuote) {
        return sendError(reply, {
          statusCode: 409,
          code: "ORDER_CONTEXT_MISSING",
          message: "Order quote context is missing",
          requestId: request.id,
          details: { orderId }
        });
      }

      let orderUserId = await repository.getOrderUserId(orderId);
      if (!orderUserId) {
        const fallbackUserId = resolveRequestUserId(request, reply);
        if (!fallbackUserId) {
          return;
        }
        orderUserId = fallbackUserId;
        await repository.setOrderUserId(orderId, fallbackUserId);
      }

      const persistedRefund = await repository.getSuccessfulRefund(orderId);
      let successfulRefund: z.output<typeof paymentsRefundResponseSchema> | undefined;
      if (persistedRefund !== undefined) {
        const parsedPersistedRefund = paymentsRefundResponseSchema.safeParse(persistedRefund);
        if (parsedPersistedRefund.success && parsedPersistedRefund.data.status === "REFUNDED") {
          successfulRefund = parsedPersistedRefund.data;
        }
      }
      if (!successfulRefund) {
        const refundPayload = paymentsRefundRequestSchema.parse({
          orderId,
          paymentId,
          amountCents: existingOrder.total.amountCents,
          currency: existingOrder.total.currency,
          reason: input.reason,
          idempotencyKey: toRefundIdempotencyKey(orderId, input.reason)
        });

        let refundResponse: Response;
        try {
          refundResponse = await fetch(`${paymentsBaseUrl}/v1/payments/refunds`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-request-id": request.id
            },
            body: JSON.stringify(refundPayload)
          });
        } catch {
          return sendError(reply, {
            statusCode: 502,
            code: "PAYMENTS_UNAVAILABLE",
            message: "Payments service is unavailable",
            requestId: request.id
          });
        }

        const parsedRefundBody = parseJsonSafely(await refundResponse.text());
        if (!refundResponse.ok) {
          return sendError(reply, {
            statusCode: 502,
            code: "REFUND_REQUEST_FAILED",
            message: `Payments refund request failed with status ${refundResponse.status}`,
            requestId: request.id,
            details: { upstreamBody: parsedRefundBody }
          });
        }

        const parsedRefund = paymentsRefundResponseSchema.safeParse(parsedRefundBody);
        if (!parsedRefund.success) {
          return sendError(reply, {
            statusCode: 502,
            code: "PAYMENTS_INVALID_RESPONSE",
            message: "Payments service returned an invalid refund response",
            requestId: request.id,
            details: parsedRefund.error.flatten()
          });
        }

        if (parsedRefund.data.status === "REJECTED") {
          return sendError(reply, {
            statusCode: 409,
            code: "REFUND_REJECTED",
            message: parsedRefund.data.message ?? "Clover rejected the refund",
            requestId: request.id,
            details: {
              paymentId: parsedRefund.data.paymentId,
              refundId: parsedRefund.data.refundId,
              provider: parsedRefund.data.provider
            }
          });
        }

        successfulRefund = parsedRefund.data;
        await repository.setSuccessfulRefund(orderId, parsedRefund.data);
      }

      const reverseEarnMutation = loyaltyMutationRequestSchema.parse({
        type: "ADJUSTMENT",
        userId: orderUserId,
        orderId,
        points: -existingOrder.total.amountCents,
        idempotencyKey: toLoyaltyIdempotencyKey(orderId, "reverse-earn")
      });
      const reverseEarnResult = await applyLoyaltyMutation({
        request,
        reply,
        loyaltyBaseUrl,
        mutation: reverseEarnMutation,
        failureCode: "LOYALTY_REVERSAL_FAILED",
        failureMessage: "Loyalty earn reversal failed"
      });
      if (!reverseEarnResult) {
        return;
      }

      if (orderQuote.pointsToRedeem > 0) {
        const refundRedeemMutation = loyaltyMutationRequestSchema.parse({
          type: "REFUND",
          userId: orderUserId,
          orderId,
          amountCents: orderQuote.pointsToRedeem,
          idempotencyKey: toLoyaltyIdempotencyKey(orderId, "refund-redeem")
        });
        const refundRedeemResult = await applyLoyaltyMutation({
          request,
          reply,
          loyaltyBaseUrl,
          mutation: refundRedeemMutation,
          failureCode: "LOYALTY_REVERSAL_FAILED",
          failureMessage: "Loyalty redeem refund failed"
        });
        if (!refundRedeemResult) {
          return;
        }
      }

      const loyaltyReversalParts = [
        `reversed ${existingOrder.total.amountCents} earned points`,
        orderQuote.pointsToRedeem > 0 ? `refunded ${orderQuote.pointsToRedeem} redeemed points` : undefined
      ].filter((value): value is string => Boolean(value));

      refundNote = ` Refund submitted: ${successfulRefund.refundId}. Loyalty updated: ${loyaltyReversalParts.join("; ")}.`;
    }

    const canceledOrder = appendOrderStatus(
      existingOrder,
      "CANCELED",
      `Canceled by customer: ${input.reason}.${refundNote}`
    );
    await repository.updateOrder(orderId, canceledOrder);
    let notificationUserId = await repository.getOrderUserId(orderId);
    if (!notificationUserId) {
      const fallbackUserId = resolveRequestUserId(request, reply);
      if (!fallbackUserId) {
        return;
      }
      notificationUserId = fallbackUserId;
      await repository.setOrderUserId(orderId, fallbackUserId);
    }
    await sendOrderStateNotification({
      request,
      notificationsBaseUrl,
      userId: notificationUserId,
      order: canceledOrder
    });

      return canceledOrder;
    }
  );

  app.post("/v1/orders/internal/ping", async (request) => {
    const parsed = payloadSchema.parse(request.body ?? {});

    return {
      service: "orders",
      accepted: true,
      payload: parsed
    };
  });
}
