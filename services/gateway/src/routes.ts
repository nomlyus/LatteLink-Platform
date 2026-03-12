import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { apiErrorSchema, authSessionSchema } from "@gazelle/contracts-core";
import {
  appleExchangeRequestSchema,
  authContract,
  logoutRequestSchema,
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  meResponseSchema,
  passkeyChallengeRequestSchema,
  passkeyChallengeResponseSchema,
  passkeyVerifyRequestSchema,
  refreshRequestSchema
} from "@gazelle/contracts-auth";
import { catalogContract, menuResponseSchema, storeConfigResponseSchema } from "@gazelle/contracts-catalog";
import {
  ordersContract,
  createOrderRequestSchema,
  orderQuoteSchema,
  orderSchema,
  payOrderRequestSchema,
  quoteRequestSchema
} from "@gazelle/contracts-orders";
import { loyaltyBalanceSchema, loyaltyContract, loyaltyLedgerEntrySchema } from "@gazelle/contracts-loyalty";
import {
  notificationsContract,
  pushTokenUpsertResponseSchema,
  pushTokenUpsertSchema
} from "@gazelle/contracts-notifications";

const authHeaderSchema = z.object({
  authorization: z.string().startsWith("Bearer ").optional()
});
const orderIdParamsSchema = z.object({ orderId: z.string().uuid() });
const cancelOrderRequestSchema = z.object({ reason: z.string().min(1) });
const defaultRateLimitWindowMs = 60_000;
const defaultGatewayAuthRateLimitMax = 90;
const defaultGatewayOrdersWriteRateLimitMax = 120;
const defaultGatewayDevicesWriteRateLimitMax = 120;

function unauthorized(requestId: string) {
  return apiErrorSchema.parse({
    code: "UNAUTHORIZED",
    message: "Missing or invalid auth token",
    requestId
  });
}

function ensureBearerAuth(request: FastifyRequest, reply: FastifyReply) {
  const parsed = authHeaderSchema.safeParse(request.headers);
  if (!parsed.success || !parsed.data.authorization) {
    reply.status(401).send(unauthorized(request.id));
    return false;
  }

  return true;
}

const authSuccessSchema = z.object({ success: z.literal(true) });

function toPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
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

function toErrorDetails(input: unknown): Record<string, unknown> | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  return { upstreamBody: input };
}

async function proxyUpstream<TResponse>(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  baseUrl: string;
  serviceLabel: string;
  method: "GET" | "POST" | "PUT";
  path: string;
  body?: unknown;
  responseSchema: z.ZodType<TResponse>;
}) {
  const { request, reply, baseUrl, serviceLabel, method, path, body, responseSchema } = params;

  const headers: Record<string, string> = {
    "x-request-id": request.id
  };
  const authorization = request.headers.authorization;
  const userIdHeader = request.headers["x-user-id"];

  if (typeof authorization === "string") {
    headers.authorization = authorization;
  }
  if (typeof userIdHeader === "string") {
    headers["x-user-id"] = userIdHeader;
  }

  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    return reply.status(502).send(
      apiErrorSchema.parse({
        code: "UPSTREAM_UNAVAILABLE",
        message: `${serviceLabel} service is unavailable`,
        requestId: request.id
      })
    );
  }

  const rawBody = await upstreamResponse.text();
  const parsedBody = parseJsonSafely(rawBody);

  if (!upstreamResponse.ok) {
    const upstreamError = apiErrorSchema.safeParse(parsedBody);

    if (upstreamError.success) {
      return reply.status(upstreamResponse.status).send(upstreamError.data);
    }

    return reply.status(upstreamResponse.status).send(
      apiErrorSchema.parse({
        code: "UPSTREAM_ERROR",
        message: `${serviceLabel} request failed with status ${upstreamResponse.status}`,
        requestId: request.id,
        details: toErrorDetails(parsedBody)
      })
    );
  }

  const parsedResponse = responseSchema.safeParse(parsedBody);

  if (!parsedResponse.success) {
    return reply.status(502).send(
      apiErrorSchema.parse({
        code: "UPSTREAM_INVALID_RESPONSE",
        message: `${serviceLabel} response did not match contract`,
        requestId: request.id,
        details: parsedResponse.error.flatten()
      })
    );
  }

  return reply.status(upstreamResponse.status).send(parsedResponse.data);
}

export async function registerRoutes(app: FastifyInstance) {
  const identityBaseUrl = process.env.IDENTITY_SERVICE_BASE_URL ?? "http://127.0.0.1:3000";
  const ordersBaseUrl = process.env.ORDERS_SERVICE_BASE_URL ?? "http://127.0.0.1:3001";
  const catalogBaseUrl = process.env.CATALOG_SERVICE_BASE_URL ?? "http://127.0.0.1:3002";
  const loyaltyBaseUrl = process.env.LOYALTY_SERVICE_BASE_URL ?? "http://127.0.0.1:3004";
  const notificationsBaseUrl = process.env.NOTIFICATIONS_SERVICE_BASE_URL ?? "http://127.0.0.1:3005";
  const gatewayRateLimitWindowMs = toPositiveInteger(
    process.env.GATEWAY_RATE_LIMIT_WINDOW_MS,
    defaultRateLimitWindowMs
  );
  const gatewayAuthRateLimit = {
    max: toPositiveInteger(process.env.GATEWAY_RATE_LIMIT_AUTH_MAX, defaultGatewayAuthRateLimitMax),
    timeWindow: gatewayRateLimitWindowMs
  };
  const gatewayOrdersWriteRateLimit = {
    max: toPositiveInteger(process.env.GATEWAY_RATE_LIMIT_ORDERS_WRITE_MAX, defaultGatewayOrdersWriteRateLimitMax),
    timeWindow: gatewayRateLimitWindowMs
  };
  const gatewayDevicesWriteRateLimit = {
    max: toPositiveInteger(process.env.GATEWAY_RATE_LIMIT_DEVICES_WRITE_MAX, defaultGatewayDevicesWriteRateLimitMax),
    timeWindow: gatewayRateLimitWindowMs
  };

  app.get("/health", async () => ({ status: "ok", service: "gateway" }));
  app.get("/ready", async () => ({ status: "ready", service: "gateway" }));

  app.get("/v1/meta/contracts", async () => ({
    auth: authContract.basePath,
    catalog: catalogContract.basePath,
    orders: ordersContract.basePath,
    loyalty: loyaltyContract.basePath,
    notifications: notificationsContract.basePath
  }));

  app.post(
    "/v1/auth/apple/exchange",
    {
      preHandler: app.rateLimit(gatewayAuthRateLimit)
    },
    async (request, reply) => {
      const input = appleExchangeRequestSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: "/v1/auth/apple/exchange",
        body: input,
        responseSchema: authSessionSchema
      });
    }
  );

  app.post(
    "/v1/auth/passkey/register/challenge",
    {
      preHandler: app.rateLimit(gatewayAuthRateLimit)
    },
    async (request, reply) => {
      const input = passkeyChallengeRequestSchema.parse(request.body ?? {});

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: "/v1/auth/passkey/register/challenge",
        body: input,
        responseSchema: passkeyChallengeResponseSchema
      });
    }
  );

  app.post(
    "/v1/auth/passkey/register/verify",
    {
      preHandler: app.rateLimit(gatewayAuthRateLimit)
    },
    async (request, reply) => {
      const input = passkeyVerifyRequestSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: "/v1/auth/passkey/register/verify",
        body: input,
        responseSchema: authSessionSchema
      });
    }
  );

  app.post(
    "/v1/auth/passkey/auth/challenge",
    {
      preHandler: app.rateLimit(gatewayAuthRateLimit)
    },
    async (request, reply) => {
      const input = passkeyChallengeRequestSchema.parse(request.body ?? {});

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: "/v1/auth/passkey/auth/challenge",
        body: input,
        responseSchema: passkeyChallengeResponseSchema
      });
    }
  );

  app.post(
    "/v1/auth/passkey/auth/verify",
    {
      preHandler: app.rateLimit(gatewayAuthRateLimit)
    },
    async (request, reply) => {
      const input = passkeyVerifyRequestSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: "/v1/auth/passkey/auth/verify",
        body: input,
        responseSchema: authSessionSchema
      });
    }
  );

  app.post(
    "/v1/auth/magic-link/request",
    {
      preHandler: app.rateLimit(gatewayAuthRateLimit)
    },
    async (request, reply) => {
      const input = magicLinkRequestSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: "/v1/auth/magic-link/request",
        body: input,
        responseSchema: authSuccessSchema
      });
    }
  );

  app.post(
    "/v1/auth/magic-link/verify",
    {
      preHandler: app.rateLimit(gatewayAuthRateLimit)
    },
    async (request, reply) => {
      const input = magicLinkVerifySchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: "/v1/auth/magic-link/verify",
        body: input,
        responseSchema: authSessionSchema
      });
    }
  );

  app.post(
    "/v1/auth/refresh",
    {
      preHandler: app.rateLimit(gatewayAuthRateLimit)
    },
    async (request, reply) => {
      const input = refreshRequestSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: "/v1/auth/refresh",
        body: input,
        responseSchema: authSessionSchema
      });
    }
  );

  app.post("/v1/auth/logout", async (request, reply) => {
    const input = logoutRequestSchema.parse(request.body);

    return proxyUpstream({
      request,
      reply,
      baseUrl: identityBaseUrl,
      serviceLabel: "Identity",
      method: "POST",
      path: "/v1/auth/logout",
      body: input,
      responseSchema: authSuccessSchema
    });
  });

  app.get("/v1/auth/me", async (request, reply) => {
    if (!ensureBearerAuth(request, reply)) {
      return;
    }

    return proxyUpstream({
      request,
      reply,
      baseUrl: identityBaseUrl,
      serviceLabel: "Identity",
      method: "GET",
      path: "/v1/auth/me",
      responseSchema: meResponseSchema
    });
  });

  app.get("/v1/me", async (request, reply) => {
    if (!ensureBearerAuth(request, reply)) {
      return;
    }

    return proxyUpstream({
      request,
      reply,
      baseUrl: identityBaseUrl,
      serviceLabel: "Identity",
      method: "GET",
      path: "/v1/auth/me",
      responseSchema: meResponseSchema
    });
  });

  app.get("/v1/menu", async (request, reply) =>
    proxyUpstream({
      request,
      reply,
      baseUrl: catalogBaseUrl,
      serviceLabel: "Catalog",
      method: "GET",
      path: "/v1/menu",
      responseSchema: menuResponseSchema
    })
  );

  app.get("/v1/store/config", async (request, reply) =>
    proxyUpstream({
      request,
      reply,
      baseUrl: catalogBaseUrl,
      serviceLabel: "Catalog",
      method: "GET",
      path: "/v1/store/config",
      responseSchema: storeConfigResponseSchema
    })
  );

  app.post(
    "/v1/orders/quote",
    {
      preHandler: app.rateLimit(gatewayOrdersWriteRateLimit)
    },
    async (request, reply) => {
      if (!ensureBearerAuth(request, reply)) {
        return;
      }
      const input = quoteRequestSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: ordersBaseUrl,
        serviceLabel: "Orders",
        method: "POST",
        path: "/v1/orders/quote",
        body: input,
        responseSchema: orderQuoteSchema
      });
    }
  );

  app.post(
    "/v1/orders",
    {
      preHandler: app.rateLimit(gatewayOrdersWriteRateLimit)
    },
    async (request, reply) => {
      if (!ensureBearerAuth(request, reply)) {
        return;
      }
      const input = createOrderRequestSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: ordersBaseUrl,
        serviceLabel: "Orders",
        method: "POST",
        path: "/v1/orders",
        body: input,
        responseSchema: orderSchema
      });
    }
  );

  app.post(
    "/v1/orders/:orderId/pay",
    {
      preHandler: app.rateLimit(gatewayOrdersWriteRateLimit)
    },
    async (request, reply) => {
      if (!ensureBearerAuth(request, reply)) {
        return;
      }
      const { orderId } = orderIdParamsSchema.parse(request.params);
      const input = payOrderRequestSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: ordersBaseUrl,
        serviceLabel: "Orders",
        method: "POST",
        path: `/v1/orders/${orderId}/pay`,
        body: input,
        responseSchema: orderSchema
      });
    }
  );

  app.get("/v1/orders", async (request, reply) => {
    if (!ensureBearerAuth(request, reply)) {
      return;
    }

    return proxyUpstream({
      request,
      reply,
      baseUrl: ordersBaseUrl,
      serviceLabel: "Orders",
      method: "GET",
      path: "/v1/orders",
      responseSchema: z.array(orderSchema)
    });
  });

  app.get("/v1/orders/:orderId", async (request, reply) => {
    if (!ensureBearerAuth(request, reply)) {
      return;
    }
    const { orderId } = orderIdParamsSchema.parse(request.params);

    return proxyUpstream({
      request,
      reply,
      baseUrl: ordersBaseUrl,
      serviceLabel: "Orders",
      method: "GET",
      path: `/v1/orders/${orderId}`,
      responseSchema: orderSchema
    });
  });

  app.post(
    "/v1/orders/:orderId/cancel",
    {
      preHandler: app.rateLimit(gatewayOrdersWriteRateLimit)
    },
    async (request, reply) => {
      if (!ensureBearerAuth(request, reply)) {
        return;
      }
      const { orderId } = orderIdParamsSchema.parse(request.params);
      const input = cancelOrderRequestSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: ordersBaseUrl,
        serviceLabel: "Orders",
        method: "POST",
        path: `/v1/orders/${orderId}/cancel`,
        body: input,
        responseSchema: orderSchema
      });
    }
  );

  app.get("/v1/loyalty/balance", async (request, reply) => {
    if (!ensureBearerAuth(request, reply)) {
      return;
    }

    return proxyUpstream({
      request,
      reply,
      baseUrl: loyaltyBaseUrl,
      serviceLabel: "Loyalty",
      method: "GET",
      path: "/v1/loyalty/balance",
      responseSchema: loyaltyBalanceSchema
    });
  });

  app.get("/v1/loyalty/ledger", async (request, reply) => {
    if (!ensureBearerAuth(request, reply)) {
      return;
    }

    return proxyUpstream({
      request,
      reply,
      baseUrl: loyaltyBaseUrl,
      serviceLabel: "Loyalty",
      method: "GET",
      path: "/v1/loyalty/ledger",
      responseSchema: z.array(loyaltyLedgerEntrySchema)
    });
  });

  app.put(
    "/v1/devices/push-token",
    {
      preHandler: app.rateLimit(gatewayDevicesWriteRateLimit)
    },
    async (request, reply) => {
      if (!ensureBearerAuth(request, reply)) {
        return;
      }
      const input = pushTokenUpsertSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: notificationsBaseUrl,
        serviceLabel: "Notifications",
        method: "PUT",
        path: "/v1/devices/push-token",
        body: input,
        responseSchema: pushTokenUpsertResponseSchema
      });
    }
  );
}
