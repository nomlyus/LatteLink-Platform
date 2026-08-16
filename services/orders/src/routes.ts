import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createEventBusPublisher } from "@lattelink/event-bus";
import { captureOperationalError } from "@lattelink/observability";
import {
  checkoutDraftSchema,
  checkoutPaymentConfirmationResponseSchema,
  checkoutPaymentConfirmationSchema,
  checkoutPaymentContextSchema,
  createCheckoutDraftRequestSchema,
  createDiscountCodeRequestSchema,
  createOrderRequestSchema,
  discountCodeListResponseSchema,
  discountCodeRedemptionsResponseSchema,
  discountCodeSchema,
  orderPaymentContextSchema,
  orderCustomerSchema,
  ordersPaymentReconciliationSchema,
  orderSchema,
  quoteRequestSchema,
  updateDiscountCodeRequestSchema
} from "@lattelink/contracts-orders";
import { getPersistenceReadinessMetadata } from "@lattelink/persistence";
import { z } from "zod";
import { createFulfillmentConfigCache } from "./fulfillment.js";
import { createOrdersRepository, type OrdersRepository } from "./repository.js";
import {
  advanceOrderStatus,
  cancelOrder,
  confirmCheckoutPayment,
  createCheckoutDraft,
  createDiscountCode,
  createOrder,
  createQuote,
  expireCheckoutDraft,
  getOrderForRead,
  getCheckoutPaymentContext,
  listDiscountCodeRedemptions,
  listDiscountCodes,
  listOrdersForRead,
  reconcilePaymentWebhook,
  updateDiscountCode,
  type CancelOrderSource,
  type PosAdapter,
  type OrderServiceDeps,
  type RequestUserContext,
  type ServiceError
} from "./service.js";

const payloadSchema = z.object({
  id: z.string().uuid().optional()
});

const orderIdParamsSchema = z.object({
  orderId: z.string().uuid()
});

const checkoutIdParamsSchema = z.object({ checkoutId: z.string().uuid() });

const orderStatusUpdateRequestSchema = z.object({
  status: z.enum(["IN_PREP", "READY", "COMPLETED"]),
  note: z.string().min(1).optional()
});

const cancelOrderRequestSchema = z.object({
  reason: z.string().min(1)
});
const supportCancelOrderRequestSchema = cancelOrderRequestSchema.extend({
  locationId: z.string().min(1).optional()
});
const supportManualReviewRequestSchema = z.object({
  locationId: z.string().min(1).optional(),
  reason: z.string().min(1)
});

const serviceErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  details: z.record(z.unknown()).optional()
});

const submitOrderDispatchResponseSchema = z.object({
  accepted: z.literal(true),
  merchantId: z.string().min(1).optional()
});

// x-user-id is a gateway-to-service context header. Customer clients should not be talking to orders
// directly with this value; gateway/internal auth remains the trust boundary.
const userHeadersSchema = z.object({
  "x-user-id": z.string().uuid().optional()
});

const internalHeadersSchema = z.object({
  "x-internal-token": z.string().optional()
});

const gatewayHeadersSchema = z.object({
  "x-gateway-token": z.string().optional()
});

const cancelSourceHeadersSchema = z.object({
  "x-order-cancel-source": z.enum(["customer", "staff"]).optional()
});

const operatorLocationHeadersSchema = z.object({
  "x-operator-location-id": z.string().min(1).optional()
});

const supportLookupQuerySchema = z.object({
  query: z.string().min(1),
  locationId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(50).default(25)
});

const discountCodeIdParamsSchema = z.object({
  discountCodeId: z.string().uuid()
});

const locationQuerySchema = z.object({
  locationId: z.string().min(1)
});

const discountRedemptionsQuerySchema = z.object({
  locationId: z.string().min(1),
  limit: z.coerce.number().int().positive().max(250).default(100)
});

const supportAuditLogEntrySchema = z.object({
  logId: z.string().min(1),
  locationId: z.string().min(1),
  actorId: z.string().min(1),
  actorType: z.string().min(1),
  action: z.string().min(1),
  targetId: z.string().optional(),
  targetType: z.string().optional(),
  payload: z.unknown().optional(),
  occurredAt: z.string().datetime()
});

const supportOrderLookupResultSchema = z.object({
  order: orderSchema,
  customer: orderCustomerSchema.optional(),
  userId: z.string().optional(),
  paymentId: z.string().optional(),
  paymentStatus: z.string().optional(),
  paymentProvider: z.string().optional(),
  paymentIntentId: z.string().optional(),
  successfulCharge: z.unknown().optional(),
  successfulRefund: z.unknown().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  auditLog: z.array(supportAuditLogEntrySchema)
});

const supportOrderLookupResponseSchema = z.object({
  results: z.array(supportOrderLookupResultSchema)
});

const supportCheckoutLookupResultSchema = z.object({
  checkout: checkoutDraftSchema,
  userId: z.string().optional(),
  paymentStatus: z.string().optional(),
  paymentProvider: z.string().optional(),
  paymentIntentId: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  auditLog: z.array(supportAuditLogEntrySchema)
});

const supportCheckoutLookupResponseSchema = z.object({
  results: z.array(supportCheckoutLookupResultSchema)
});
const supportManualReviewResponseSchema = z.object({
  marked: z.boolean()
});

const defaultRateLimitWindowMs = 60_000;
const defaultOrdersReadRateLimitMax = 240;
const defaultOrdersWriteRateLimitMax = 120;
const defaultOrdersInternalReconcileRateLimitMax = 180;

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

function parseJsonSafely(raw: string): unknown {
  if (!raw || raw.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function timingSafeTokenMatches(expectedToken: string | undefined, providedToken: string | undefined) {
  if (expectedToken === undefined || providedToken === undefined) {
    return expectedToken === providedToken;
  }

  const expectedBuffer = Buffer.from(expectedToken, "utf8");
  const providedBuffer = Buffer.from(providedToken, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

class SubmitOrderDispatchError extends Error {
  readonly merchantId?: string;

  constructor(message: string, merchantId?: string) {
    super(message);
    this.name = "SubmitOrderDispatchError";
    this.merchantId = merchantId;
  }
}

function createPosAdapter(params: {
  paymentsBaseUrl: string;
  paymentsInternalToken?: string;
  requestId: string;
}): PosAdapter {
  return {
    async submitOrder(order) {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-request-id": params.requestId
      };
      if (params.paymentsInternalToken) {
        headers["x-internal-token"] = params.paymentsInternalToken;
      }

      let response: Response;
      try {
        response = await fetch(`${params.paymentsBaseUrl}/v1/payments/orders/submit`, {
          method: "POST",
          headers,
          body: JSON.stringify(order)
        });
      } catch (error) {
        throw new SubmitOrderDispatchError(
          `Payments order submission request failed: ${error instanceof Error ? error.message : "unknown error"}`
        );
      }

      const body = parseJsonSafely(await response.text());
      if (!response.ok) {
        const parsed = serviceErrorSchema.safeParse(body);
        const message = parsed.success
          ? parsed.data.message
          : `Payments order submission failed with status ${response.status}`;
        const merchantId =
          parsed.success && typeof parsed.data.details?.merchantId === "string"
            ? parsed.data.details.merchantId
            : undefined;
        throw new SubmitOrderDispatchError(message, merchantId);
      }

      const parsed = submitOrderDispatchResponseSchema.safeParse(body);
      if (!parsed.success || !parsed.data.accepted) {
        throw new SubmitOrderDispatchError("Payments order submission returned an invalid response");
      }
    }
  };
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

function sendServiceError(reply: FastifyReply, request: FastifyRequest, error: ServiceError) {
  if (error.code === "INVALID_USER_CONTEXT") {
    request.log.warn(
      {
        requestId: request.id,
        details: error.details
      },
      "invalid x-user-id header"
    );
  }

  return sendError(reply, {
    ...error,
    requestId: request.id
  });
}

function logOrderMutation(
  request: FastifyRequest,
  message: string,
  details: Record<string, unknown>
) {
  request.log.info(
    {
      service: "orders",
      event: typeof details.event === "string" ? details.event : message.replace(/\s+/g, "."),
      timestamp: new Date().toISOString(),
      requestId: request.id,
      ...details
    },
    message
  );
}

async function recordAuditLog(
  request: FastifyRequest,
  repository: OrdersRepository,
  entry: Parameters<OrdersRepository["writeAuditLog"]>[0]
) {
  try {
    await repository.writeAuditLog(entry);
  } catch (error) {
    request.log.error(
      {
        error,
        requestId: request.id,
        auditAction: entry.action,
        targetId: entry.targetId
      },
      "audit log write failed"
    );
  }
}

function parseRequestUserContext(request: FastifyRequest): RequestUserContext {
  const parsedHeaders = userHeadersSchema.safeParse(request.headers);
  if (!parsedHeaders.success) {
    return {
      error: {
        statusCode: 400,
        code: "INVALID_USER_CONTEXT",
        message: "x-user-id header must be a UUID when provided",
        details: parsedHeaders.error.flatten()
      }
    };
  }

  return {
    userId: parsedHeaders.data["x-user-id"]
  };
}

function authorizeInternalRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  internalToken: string | undefined,
  options: { allowUnauthenticated?: boolean } = {}
) {
  if (!internalToken) {
    if (options.allowUnauthenticated) {
      return true;
    }

    sendError(reply, {
      statusCode: 503,
      code: "INTERNAL_ACCESS_NOT_CONFIGURED",
      message: "ORDERS_INTERNAL_API_TOKEN must be configured before accepting internal orders requests",
      requestId: request.id
    });
    return false;
  }

  const parsedHeaders = internalHeadersSchema.safeParse(request.headers);
  const providedToken = parsedHeaders.success ? parsedHeaders.data["x-internal-token"] : undefined;
  if (providedToken && timingSafeTokenMatches(internalToken, providedToken)) {
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

function authorizeGatewayRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  gatewayToken: string | undefined,
  options: { allowUnauthenticated?: boolean } = {}
) {
  if (!gatewayToken) {
    if (options.allowUnauthenticated) {
      return true;
    }

    sendError(reply, {
      statusCode: 503,
      code: "GATEWAY_ACCESS_NOT_CONFIGURED",
      message: "GATEWAY_INTERNAL_API_TOKEN must be configured before accepting gateway orders requests",
      requestId: request.id
    });
    return false;
  }

  const parsedHeaders = gatewayHeadersSchema.safeParse(request.headers);
  const providedToken = parsedHeaders.success ? parsedHeaders.data["x-gateway-token"] : undefined;
  if (providedToken && timingSafeTokenMatches(gatewayToken, providedToken)) {
    return true;
  }

  sendError(reply, {
    statusCode: 401,
    code: "UNAUTHORIZED_GATEWAY_REQUEST",
    message: "Gateway token is invalid",
    requestId: request.id
  });
  return false;
}

export async function registerRoutes(app: FastifyInstance) {
  const paymentsBaseUrl = process.env.PAYMENTS_SERVICE_BASE_URL ?? "http://127.0.0.1:3003";
  const loyaltyBaseUrl = process.env.LOYALTY_SERVICE_BASE_URL ?? "http://127.0.0.1:3004";
  const notificationsBaseUrl = process.env.NOTIFICATIONS_SERVICE_BASE_URL ?? "http://127.0.0.1:3005";
  const catalogBaseUrl = process.env.CATALOG_SERVICE_BASE_URL ?? "http://127.0.0.1:3002";
  const internalApiToken = trimToUndefined(process.env.ORDERS_INTERNAL_API_TOKEN);
  const loyaltyInternalApiToken = trimToUndefined(process.env.LOYALTY_INTERNAL_API_TOKEN);
  const notificationsInternalApiToken = trimToUndefined(process.env.NOTIFICATIONS_INTERNAL_API_TOKEN);
  const ordersRateLimitWindowMs = toPositiveInteger(process.env.ORDERS_RATE_LIMIT_WINDOW_MS, defaultRateLimitWindowMs);
  const ordersReadRateLimit = {
    max: toPositiveInteger(process.env.ORDERS_RATE_LIMIT_READ_MAX, defaultOrdersReadRateLimitMax),
    timeWindow: ordersRateLimitWindowMs
  };
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
  const gatewayApiToken = trimToUndefined(process.env.GATEWAY_INTERNAL_API_TOKEN);
  const allowUnauthenticatedInternalAccess =
    process.env.NODE_ENV !== "production" && process.env.ALLOW_UNAUTHENTICATED_ORDERS_INTERNAL === "true";
  const allowUnauthenticatedGatewayAccess =
    process.env.NODE_ENV !== "production" && process.env.ALLOW_UNAUTHENTICATED_ORDERS_GATEWAY === "true";
  const valkeyUrl = trimToUndefined(process.env.VALKEY_URL);
  const eventBusPublisher = valkeyUrl ? createEventBusPublisher(valkeyUrl) : undefined;
  const fulfillmentConfigCache = createFulfillmentConfigCache({ catalogBaseUrl });
  const repository = await createOrdersRepository(app.log);
  const sharedDeps = {
    repository,
    catalogBaseUrl,
    paymentsBaseUrl,
    paymentsInternalToken: internalApiToken,
    loyaltyBaseUrl,
    loyaltyInternalToken: loyaltyInternalApiToken,
    notificationsBaseUrl,
    notificationsInternalToken: notificationsInternalApiToken,
    eventBusPublisher
  };

  const getServiceDeps = (request: FastifyRequest): OrderServiceDeps => ({
    ...sharedDeps,
    getFulfillmentConfig: fulfillmentConfigCache.get,
    posAdapter: createPosAdapter({
      paymentsBaseUrl,
      paymentsInternalToken: internalApiToken,
      requestId: request.id
    }),
    logger: request.log
  });

  app.addHook("onClose", async () => {
    await repository.close();
    await eventBusPublisher?.quit();
  });

  app.get("/health", async () => ({ status: "ok", service: "orders" }));
  app.get("/ready", async (_request, reply) => {
    try {
      await repository.pingDb();
      return { status: "ready", service: "orders", persistence: repository.backend, environment: getPersistenceReadinessMetadata() };
    } catch {
      reply.status(503);
      return {
        status: "unavailable",
        service: "orders",
        error: "Database unavailable",
        environment: getPersistenceReadinessMetadata()
      };
    }
  });

  app.post(
    "/v1/orders/internal/payments/reconcile",
    {
      preHandler: app.rateLimit(ordersInternalReconcileRateLimit)
    },
    async (request, reply) => {
      if (!authorizeInternalRequest(request, reply, internalApiToken, { allowUnauthenticated: allowUnauthenticatedInternalAccess })) {
        return;
      }

      const input = ordersPaymentReconciliationSchema.parse(request.body);
      const result = await reconcilePaymentWebhook({
        input,
        requestId: request.id,
        deps: getServiceDeps(request)
      });

      if ("error" in result) {
        captureOperationalError({
          service: "orders",
          event: "payment.reconciliation.rejected",
          error: new Error(result.error.message),
          requestId: request.id,
          tags: {
            provider: input.provider,
            kind: input.kind,
            paymentStatus: input.status,
            orderId: input.orderId,
            paymentId: input.paymentId,
            code: result.error.code
          },
          context: {
            input,
            error: result.error
          },
          fingerprint: ["orders", "payment-reconciliation-rejected", result.error.code]
        });
        return sendServiceError(reply, request, result.error);
      }

      logOrderMutation(request, "payment reconciliation processed", {
        event: "payment.reconciled",
        orderId: input.orderId,
        paymentId: input.paymentId,
        provider: input.provider,
        kind: input.kind,
        paymentStatus: input.status,
        reconciliationApplied: result.result.applied,
        reconciledOrderStatus: result.result.orderStatus
      });
      const reconciledOrder = await repository.getOrder(input.orderId);
      await recordAuditLog(request, repository, {
        locationId: reconciledOrder?.locationId ?? "unknown",
        actorId: "system:payments",
        actorType: "system",
        action: "order.payment_reconciled",
        targetId: input.orderId,
        targetType: "order",
        payload: {
          paymentId: input.paymentId,
          provider: input.provider,
          kind: input.kind,
          paymentStatus: input.status,
          applied: result.result.applied,
          orderStatus: result.result.orderStatus
        }
      });
      return result.result;
    }
  );

  app.get(
    "/v1/orders/internal/support/lookup",
    {
      preHandler: app.rateLimit(ordersInternalReconcileRateLimit)
    },
    async (request, reply) => {
      if (!authorizeInternalRequest(request, reply, internalApiToken, { allowUnauthenticated: allowUnauthenticatedInternalAccess })) {
        return;
      }

      const input = supportLookupQuerySchema.parse(request.query);
      const results = await repository.lookupSupportOrders(input);
      return supportOrderLookupResponseSchema.parse({ results });
    }
  );

  app.get(
    "/v1/orders/internal/support/checkouts",
    {
      preHandler: app.rateLimit(ordersInternalReconcileRateLimit)
    },
    async (request, reply) => {
      if (!authorizeInternalRequest(request, reply, internalApiToken, { allowUnauthenticated: allowUnauthenticatedInternalAccess })) {
        return;
      }

      const input = supportLookupQuerySchema.parse(request.query);
      const results = await repository.lookupSupportCheckoutDrafts(input);
      return supportCheckoutLookupResponseSchema.parse({ results });
    }
  );

  app.get(
    "/v1/orders/internal/:orderId/payment-context",
    {
      preHandler: app.rateLimit(ordersInternalReconcileRateLimit)
    },
    async (request, reply) => {
      if (!authorizeInternalRequest(request, reply, internalApiToken, { allowUnauthenticated: allowUnauthenticatedInternalAccess })) {
        return;
      }

      const { orderId } = orderIdParamsSchema.parse(request.params);
      const userContext = parseRequestUserContext(request);
      if (userContext.error) {
        return sendServiceError(reply, request, userContext.error);
      }

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

      if (userContext.userId) {
        const orderUserId = await repository.getOrderUserId(orderId);
        if (orderUserId !== userContext.userId) {
          return sendError(reply, {
            statusCode: 404,
            code: "ORDER_NOT_FOUND",
            message: "Order not found",
            requestId: request.id,
            details: { orderId }
          });
        }
      }

      return orderPaymentContextSchema.parse({
        orderId: order.id,
        locationId: order.locationId,
        status: order.status,
        total: order.total
      });
    }
  );

  app.post(
    "/v1/orders/quote",
    {
      preHandler: app.rateLimit(ordersWriteRateLimit)
    },
    async (request, reply) => {
      if (!authorizeGatewayRequest(request, reply, gatewayApiToken, { allowUnauthenticated: allowUnauthenticatedGatewayAccess })) {
        return;
      }

      const input = quoteRequestSchema.parse(request.body);
      const requestUserContext = parseRequestUserContext(request);
      const result = await createQuote({
        input,
        requestUserContext,
        deps: getServiceDeps(request)
      });

      if ("error" in result) {
        return sendServiceError(reply, request, result.error);
      }

      await repository.saveQuote(result.quote);
      return result.quote;
    }
  );

  // lgtm [js/missing-rate-limiting] - Fastify route-level preHandler rate limiting is applied.
  app.get(
    "/v1/orders/admin/discount-codes",
    {
      preHandler: app.rateLimit(ordersReadRateLimit)
    },
    async (request, reply) => {
      if (!authorizeGatewayRequest(request, reply, gatewayApiToken, { allowUnauthenticated: allowUnauthenticatedGatewayAccess })) {
        return;
      }

      const { locationId } = locationQuerySchema.parse(request.query);
      const result = await listDiscountCodes({
        locationId,
        deps: getServiceDeps(request)
      });
      return discountCodeListResponseSchema.parse(result);
    }
  );

  app.post(
    "/v1/orders/admin/discount-codes",
    {
      preHandler: app.rateLimit(ordersWriteRateLimit)
    },
    async (request, reply) => {
      if (!authorizeGatewayRequest(request, reply, gatewayApiToken, { allowUnauthenticated: allowUnauthenticatedGatewayAccess })) {
        return;
      }

      const input = createDiscountCodeRequestSchema.parse(request.body);
      const result = await createDiscountCode({
        input,
        deps: getServiceDeps(request)
      });
      if ("error" in result) {
        return sendServiceError(reply, request, result.error);
      }

      await repository.writeAuditLog({
        locationId: input.locationId,
        actorId: parseRequestUserContext(request).userId ?? "system",
        actorType: "operator",
        action: "discount_code.created",
        targetId: result.discountCode.discountCodeId,
        targetType: "discount_code",
        payload: {
          code: result.discountCode.code,
          type: result.discountCode.type,
          value: result.discountCode.value
        }
      });

      return reply.status(201).send(discountCodeSchema.parse(result.discountCode));
    }
  );

  app.patch(
    "/v1/orders/admin/discount-codes/:discountCodeId",
    {
      preHandler: app.rateLimit(ordersWriteRateLimit)
    },
    async (request, reply) => {
      if (!authorizeGatewayRequest(request, reply, gatewayApiToken, { allowUnauthenticated: allowUnauthenticatedGatewayAccess })) {
        return;
      }

      const { discountCodeId } = discountCodeIdParamsSchema.parse(request.params);
      const input = updateDiscountCodeRequestSchema.parse(request.body);
      const result = await updateDiscountCode({
        discountCodeId,
        input,
        deps: getServiceDeps(request)
      });
      if ("error" in result) {
        return sendServiceError(reply, request, result.error);
      }

      await repository.writeAuditLog({
        locationId: input.locationId,
        actorId: parseRequestUserContext(request).userId ?? "system",
        actorType: "operator",
        action: "discount_code.updated",
        targetId: result.discountCode.discountCodeId,
        targetType: "discount_code",
        payload: {
          code: result.discountCode.code,
          active: result.discountCode.active
        }
      });

      return discountCodeSchema.parse(result.discountCode);
    }
  );

  // lgtm [js/missing-rate-limiting] - Fastify route-level preHandler rate limiting is applied.
  app.get(
    "/v1/orders/admin/discount-codes/:discountCodeId/redemptions",
    {
      preHandler: app.rateLimit(ordersReadRateLimit)
    },
    async (request, reply) => {
      if (!authorizeGatewayRequest(request, reply, gatewayApiToken, { allowUnauthenticated: allowUnauthenticatedGatewayAccess })) {
        return;
      }

      const { discountCodeId } = discountCodeIdParamsSchema.parse(request.params);
      const query = discountRedemptionsQuerySchema.parse(request.query);
      const result = await listDiscountCodeRedemptions({
        discountCodeId,
        locationId: query.locationId,
        limit: query.limit,
        deps: getServiceDeps(request)
      });

      return discountCodeRedemptionsResponseSchema.parse(result);
    }
  );

  app.post(
    "/v1/orders/checkouts",
    { preHandler: app.rateLimit(ordersWriteRateLimit) },
    async (request, reply) => {
      if (!authorizeGatewayRequest(request, reply, gatewayApiToken, { allowUnauthenticated: allowUnauthenticatedGatewayAccess })) return;
      const result = await createCheckoutDraft({
        input: createCheckoutDraftRequestSchema.parse(request.body),
        requestUserContext: parseRequestUserContext(request),
        requestId: request.id,
        deps: getServiceDeps(request)
      });
      if ("error" in result) return sendServiceError(reply, request, result.error);
      return checkoutDraftSchema.parse(result.checkout);
    }
  );

  app.get(
    "/v1/orders/internal/checkouts/:checkoutId/payment-context",
    { preHandler: app.rateLimit(ordersReadRateLimit) },
    async (request, reply) => {
      if (!authorizeInternalRequest(request, reply, internalApiToken, { allowUnauthenticated: allowUnauthenticatedInternalAccess })) return;
      const { checkoutId } = checkoutIdParamsSchema.parse(request.params);
      const result = await getCheckoutPaymentContext({
        checkoutId,
        requestUserId: parseRequestUserContext(request).userId,
        deps: getServiceDeps(request)
      });
      if ("error" in result && result.error) return sendServiceError(reply, request, result.error);
      return checkoutPaymentContextSchema.parse(result.context);
    }
  );

  app.post(
    "/v1/orders/internal/checkouts/:checkoutId/expire",
    { preHandler: app.rateLimit(ordersWriteRateLimit) },
    async (request, reply) => {
      if (!authorizeInternalRequest(request, reply, internalApiToken, { allowUnauthenticated: allowUnauthenticatedInternalAccess })) return;
      const { checkoutId } = checkoutIdParamsSchema.parse(request.params);
      const draft = await repository.getCheckoutDraft(checkoutId);
      const result = await expireCheckoutDraft({ checkoutId, deps: getServiceDeps(request) });
      if ("error" in result && result.error) return sendServiceError(reply, request, result.error);
      if (result.expired && draft) {
        await recordAuditLog(request, repository, {
          locationId: draft.locationId,
          actorId: parseRequestUserContext(request).userId ?? "internal",
          actorType: "internal_admin",
          action: "checkout.expired",
          targetId: checkoutId,
          targetType: "checkout",
          payload: {
            source: "support_recovery",
            previousStatus: draft.status,
            expiresAt: draft.expiresAt
          }
        });
      }
      return result;
    }
  );

  app.post(
    "/v1/orders/internal/checkouts/confirm-payment",
    { preHandler: app.rateLimit(ordersWriteRateLimit) },
    async (request, reply) => {
      if (!authorizeInternalRequest(request, reply, internalApiToken, { allowUnauthenticated: allowUnauthenticatedInternalAccess })) return;
      const result = await confirmCheckoutPayment({
        input: checkoutPaymentConfirmationSchema.parse(request.body),
        requestId: request.id,
        deps: getServiceDeps(request)
      });
      if ("error" in result && result.error) return sendServiceError(reply, request, result.error);
      return checkoutPaymentConfirmationResponseSchema.parse(result.result);
    }
  );

  app.post(
    "/v1/orders",
    {
      preHandler: app.rateLimit(ordersWriteRateLimit)
    },
    async (request, reply) => {
      if (!authorizeGatewayRequest(request, reply, gatewayApiToken, { allowUnauthenticated: allowUnauthenticatedGatewayAccess })) {
        return;
      }

      const input = createOrderRequestSchema.parse(request.body);
      const requestUserContext = parseRequestUserContext(request);
      const result = await createOrder({
        input,
        requestId: request.id,
        requestUserContext,
        deps: getServiceDeps(request)
      });

      if ("error" in result) {
        return sendServiceError(reply, request, result.error);
      }

      logOrderMutation(request, "order created", {
        event: "order.created",
        orderId: result.order.id,
        locationId: result.order.locationId,
        status: result.order.status,
        totalAmountCents: result.order.total.amountCents
      });
      return result.order;
    }
  );

  // lgtm [js/missing-rate-limiting] - Fastify route-level preHandler rate limiting is applied.
  app.get(
    "/v1/orders",
    {
      preHandler: app.rateLimit(ordersReadRateLimit)
    },
    async (request, reply) => {
      if (!authorizeGatewayRequest(request, reply, gatewayApiToken, { allowUnauthenticated: allowUnauthenticatedGatewayAccess })) {
        return;
      }

      const parsedOperatorHeaders = operatorLocationHeadersSchema.safeParse(request.headers);
      const operatorLocationId = parsedOperatorHeaders.success
        ? parsedOperatorHeaders.data["x-operator-location-id"]
        : undefined;

      const requestUserContext = parseRequestUserContext(request);
      if (requestUserContext.error) {
        return sendServiceError(reply, request, requestUserContext.error);
      }

      const result = await listOrdersForRead({
        requestId: request.id,
        requestUserId: requestUserContext.userId,
        locationId: operatorLocationId,
        deps: getServiceDeps(request)
      });

      return z.array(orderSchema).parse(result.orders);
    }
  );

  // lgtm [js/missing-rate-limiting] - Fastify route-level preHandler rate limiting is applied.
  app.get(
    "/v1/orders/:orderId",
    {
      preHandler: app.rateLimit(ordersReadRateLimit)
    },
    async (request, reply) => {
      if (!authorizeGatewayRequest(request, reply, gatewayApiToken, { allowUnauthenticated: allowUnauthenticatedGatewayAccess })) {
        return;
      }

      const { orderId } = orderIdParamsSchema.parse(request.params);
      const parsedOperatorHeaders = operatorLocationHeadersSchema.safeParse(request.headers);
      const operatorLocationId = parsedOperatorHeaders.success
        ? parsedOperatorHeaders.data["x-operator-location-id"]
        : undefined;
      const requestUserContext = parseRequestUserContext(request);
      if (requestUserContext.error) {
        return sendServiceError(reply, request, requestUserContext.error);
      }
      const result = await getOrderForRead({
        orderId,
        locationId: operatorLocationId,
        requestUserId: requestUserContext.userId,
        requestId: request.id,
        deps: getServiceDeps(request)
      });

      if ("error" in result) {
        return sendServiceError(reply, request, result.error);
      }

      return orderSchema.parse(result.order);
    }
  );

  app.post(
    "/v1/orders/:orderId/cancel",
    {
      preHandler: app.rateLimit(ordersWriteRateLimit)
    },
    async (request, reply) => {
      if (!authorizeGatewayRequest(request, reply, gatewayApiToken, { allowUnauthenticated: allowUnauthenticatedGatewayAccess })) {
        return;
      }

      const { orderId } = orderIdParamsSchema.parse(request.params);
      const input = cancelOrderRequestSchema.parse(request.body);
      const parsedCancelHeaders = cancelSourceHeadersSchema.safeParse(request.headers);
      const parsedOperatorHeaders = operatorLocationHeadersSchema.safeParse(request.headers);
      const cancelSource: CancelOrderSource = parsedCancelHeaders.success
        ? (parsedCancelHeaders.data["x-order-cancel-source"] ?? "customer")
        : "customer";
      const operatorLocationId = parsedOperatorHeaders.success
        ? parsedOperatorHeaders.data["x-operator-location-id"]
        : undefined;
      const requestUserContext = parseRequestUserContext(request);
      const result = await cancelOrder({
        orderId,
        input,
        cancelSource,
        locationId: operatorLocationId,
        requestId: request.id,
        requestUserContext,
        deps: getServiceDeps(request)
      });

      if ("error" in result) {
        return sendServiceError(reply, request, result.error);
      }

      logOrderMutation(request, "order canceled", {
        event: "order.canceled",
        orderId: result.order.id,
        locationId: result.order.locationId,
        status: result.order.status,
        cancelSource,
        reason: input.reason
      });
      await recordAuditLog(request, repository, {
        locationId: result.order.locationId,
        actorId: requestUserContext.userId ?? "operator",
        actorType: cancelSource === "customer" ? "customer" : "operator",
        action: "order.status_changed",
        targetId: result.order.id,
        targetType: "order",
        payload: {
          to: result.order.status,
          cancelSource,
          reason: input.reason
        }
      });
      return result.order;
    }
  );

  app.post(
    "/v1/orders/internal/:orderId/cancel",
    {
      preHandler: app.rateLimit(ordersWriteRateLimit)
    },
    async (request, reply) => {
      if (!authorizeInternalRequest(request, reply, internalApiToken, { allowUnauthenticated: allowUnauthenticatedInternalAccess })) {
        return;
      }

      const { orderId } = orderIdParamsSchema.parse(request.params);
      const input = cancelOrderRequestSchema.parse(request.body);
      const result = await cancelOrder({
        orderId,
        input,
        cancelSource: "system",
        requestId: request.id,
        deps: getServiceDeps(request)
      });

      if ("error" in result) {
        return sendServiceError(reply, request, result.error);
      }

      logOrderMutation(request, "order canceled by internal system", {
        event: "order.canceled",
        orderId: result.order.id,
        locationId: result.order.locationId,
        status: result.order.status,
        cancelSource: "system",
        reason: input.reason
      });
      await recordAuditLog(request, repository, {
        locationId: result.order.locationId,
        actorId: "system",
        actorType: "system",
        action: "order.status_changed",
        targetId: result.order.id,
        targetType: "order",
        payload: {
          to: result.order.status,
          cancelSource: "system",
          reason: input.reason
        }
      });
      return result.order;
    }
  );

  app.post(
    "/v1/orders/internal/support/orders/:orderId/cancel",
    {
      preHandler: app.rateLimit(ordersWriteRateLimit)
    },
    async (request, reply) => {
      if (!authorizeInternalRequest(request, reply, internalApiToken, { allowUnauthenticated: allowUnauthenticatedInternalAccess })) {
        return;
      }

      const { orderId } = orderIdParamsSchema.parse(request.params);
      const input = supportCancelOrderRequestSchema.parse(request.body);
      const parsedUserHeaders = userHeadersSchema.safeParse(request.headers);
      const actorId = parsedUserHeaders.success ? parsedUserHeaders.data["x-user-id"] : undefined;
      const result = await cancelOrder({
        orderId,
        input: {
          reason: input.reason
        },
        cancelSource: "system",
        locationId: input.locationId,
        requestId: request.id,
        deps: getServiceDeps(request)
      });

      if ("error" in result) {
        return sendServiceError(reply, request, result.error);
      }

      logOrderMutation(request, "order recovery cancellation requested by support", {
        event: "order.support.cancel_requested",
        orderId: result.order.id,
        locationId: result.order.locationId,
        status: result.order.status,
        reason: input.reason
      });
      await recordAuditLog(request, repository, {
        locationId: result.order.locationId,
        actorId: actorId ?? "internal-support",
        actorType: "internal_admin",
        action: "order.support_cancel_requested",
        targetId: result.order.id,
        targetType: "order",
        payload: {
          to: result.order.status,
          cancelSource: "system",
          reason: input.reason
        }
      });
      return orderSchema.parse(result.order);
    }
  );

  app.post(
    "/v1/orders/internal/support/orders/:orderId/manual-review",
    {
      preHandler: app.rateLimit(ordersWriteRateLimit)
    },
    async (request, reply) => {
      if (!authorizeInternalRequest(request, reply, internalApiToken, { allowUnauthenticated: allowUnauthenticatedInternalAccess })) {
        return;
      }

      const { orderId } = orderIdParamsSchema.parse(request.params);
      const input = supportManualReviewRequestSchema.parse(request.body);
      const parsedUserHeaders = userHeadersSchema.safeParse(request.headers);
      const actorId = parsedUserHeaders.success ? parsedUserHeaders.data["x-user-id"] : undefined;
      const order = await repository.getOrder(orderId);
      if (!order || (input.locationId && order.locationId !== input.locationId)) {
        return sendError(reply, {
          statusCode: 404,
          code: "ORDER_NOT_FOUND",
          message: "Order not found",
          requestId: request.id
        });
      }

      await recordAuditLog(request, repository, {
        locationId: order.locationId,
        actorId: actorId ?? "internal-support",
        actorType: "internal_admin",
        action: "order.manual_review_marked",
        targetId: order.id,
        targetType: "order",
        payload: {
          status: order.status,
          reason: input.reason
        }
      });
      logOrderMutation(request, "order marked for manual review by support", {
        event: "order.support.manual_review_marked",
        orderId: order.id,
        locationId: order.locationId,
        status: order.status,
        reason: input.reason
      });
      return supportManualReviewResponseSchema.parse({ marked: true });
    }
  );

  app.post(
    "/v1/orders/:orderId/status",
    {
      preHandler: app.rateLimit(ordersWriteRateLimit)
    },
    async (request, reply) => {
      if (!authorizeInternalRequest(request, reply, internalApiToken, { allowUnauthenticated: allowUnauthenticatedInternalAccess })) {
        return;
      }

      const { orderId } = orderIdParamsSchema.parse(request.params);
      const input = orderStatusUpdateRequestSchema.parse(request.body);
      const parsedOperatorHeaders = operatorLocationHeadersSchema.safeParse(request.headers);
      const parsedUserHeaders = userHeadersSchema.safeParse(request.headers);
      const operatorLocationId = parsedOperatorHeaders.success
        ? parsedOperatorHeaders.data["x-operator-location-id"]
        : undefined;
      const actorId = parsedUserHeaders.success ? parsedUserHeaders.data["x-user-id"] : undefined;
      const result = await advanceOrderStatus({
        orderId,
        input,
        locationId: operatorLocationId,
        requestId: request.id,
        deps: getServiceDeps(request)
      });

      if ("error" in result) {
        return sendServiceError(reply, request, result.error);
      }

      logOrderMutation(request, "order status advanced", {
        event: "order.status.advanced",
        orderId: result.order.id,
        locationId: result.order.locationId,
        status: result.order.status,
        note: input.note ?? null
      });
      await recordAuditLog(request, repository, {
        locationId: result.order.locationId,
        actorId: actorId ?? "operator",
        actorType: "operator",
        action: "order.status_changed",
        targetId: result.order.id,
        targetType: "order",
        payload: {
          to: result.order.status,
          note: input.note ?? null
        }
      });
      return result.order;
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
