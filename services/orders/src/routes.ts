import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createEventBusPublisher } from "@lattelink/event-bus";
import {
  createOrderRequestSchema,
  orderPaymentContextSchema,
  ordersPaymentReconciliationSchema,
  orderSchema,
  quoteRequestSchema
} from "@lattelink/contracts-orders";
import { getPersistenceReadinessMetadata } from "@lattelink/persistence";
import { z } from "zod";
import { createFulfillmentConfigCache } from "./fulfillment.js";
import { createOrdersRepository } from "./repository.js";
import {
  advanceOrderStatus,
  cancelOrder,
  createOrder,
  createQuote,
  getOrderForRead,
  listOrdersForRead,
  reconcilePaymentWebhook,
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

const orderStatusUpdateRequestSchema = z.object({
  status: z.enum(["IN_PREP", "READY", "COMPLETED"]),
  note: z.string().min(1).optional()
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

const defaultRateLimitWindowMs = 60_000;
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
  internalToken: string | undefined
) {
  if (!internalToken) {
    return true;
  }

  const parsedHeaders = internalHeadersSchema.safeParse(request.headers);
  const providedToken = parsedHeaders.success ? parsedHeaders.data["x-internal-token"] : undefined;
  if (timingSafeTokenMatches(internalToken, providedToken)) {
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
  gatewayToken: string | undefined
) {
  if (!gatewayToken) {
    return true;
  }

  const parsedHeaders = gatewayHeadersSchema.safeParse(request.headers);
  const providedToken = parsedHeaders.success ? parsedHeaders.data["x-gateway-token"] : undefined;
  if (timingSafeTokenMatches(gatewayToken, providedToken)) {
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
      if (!authorizeInternalRequest(request, reply, internalApiToken)) {
        return;
      }

      const input = ordersPaymentReconciliationSchema.parse(request.body);
      const result = await reconcilePaymentWebhook({
        input,
        requestId: request.id,
        deps: getServiceDeps(request)
      });

      if ("error" in result) {
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
      return result.result;
    }
  );

  app.get(
    "/v1/orders/internal/:orderId/payment-context",
    {
      preHandler: app.rateLimit(ordersInternalReconcileRateLimit)
    },
    async (request, reply) => {
      if (!authorizeInternalRequest(request, reply, internalApiToken)) {
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
      if (!authorizeGatewayRequest(request, reply, gatewayApiToken)) {
        return;
      }

      const input = quoteRequestSchema.parse(request.body);
      const result = await createQuote({
        input,
        deps: getServiceDeps(request)
      });

      if ("error" in result) {
        return sendServiceError(reply, request, result.error);
      }

      await repository.saveQuote(result.quote);
      return result.quote;
    }
  );

  app.post(
    "/v1/orders",
    {
      preHandler: app.rateLimit(ordersWriteRateLimit)
    },
    async (request, reply) => {
      if (!authorizeGatewayRequest(request, reply, gatewayApiToken)) {
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

  app.get("/v1/orders", async (request, reply) => {
    if (!authorizeGatewayRequest(request, reply, gatewayApiToken)) {
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
  });

  app.get("/v1/orders/:orderId", async (request, reply) => {
    if (!authorizeGatewayRequest(request, reply, gatewayApiToken)) {
      return;
    }

    const { orderId } = orderIdParamsSchema.parse(request.params);
    const parsedOperatorHeaders = operatorLocationHeadersSchema.safeParse(request.headers);
    const operatorLocationId = parsedOperatorHeaders.success
      ? parsedOperatorHeaders.data["x-operator-location-id"]
      : undefined;
    const result = await getOrderForRead({
      orderId,
      locationId: operatorLocationId,
      requestId: request.id,
      deps: getServiceDeps(request)
    });

    if ("error" in result) {
      return sendServiceError(reply, request, result.error);
    }

    return orderSchema.parse(result.order);
  });

  app.post(
    "/v1/orders/:orderId/cancel",
    {
      preHandler: app.rateLimit(ordersWriteRateLimit)
    },
    async (request, reply) => {
      if (!authorizeGatewayRequest(request, reply, gatewayApiToken)) {
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
      return result.order;
    }
  );

  app.post(
    "/v1/orders/internal/:orderId/cancel",
    {
      preHandler: app.rateLimit(ordersWriteRateLimit)
    },
    async (request, reply) => {
      if (!authorizeInternalRequest(request, reply, internalApiToken)) {
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
      return result.order;
    }
  );

  app.post(
    "/v1/orders/:orderId/status",
    {
      preHandler: app.rateLimit(ordersWriteRateLimit)
    },
    async (request, reply) => {
      if (!authorizeInternalRequest(request, reply, internalApiToken)) {
        return;
      }

      const { orderId } = orderIdParamsSchema.parse(request.params);
      const input = orderStatusUpdateRequestSchema.parse(request.body);
      const parsedOperatorHeaders = operatorLocationHeadersSchema.safeParse(request.headers);
      const operatorLocationId = parsedOperatorHeaders.success
        ? parsedOperatorHeaders.data["x-operator-location-id"]
        : undefined;
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
