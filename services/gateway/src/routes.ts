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
import { notificationsContract, pushTokenUpsertSchema } from "@gazelle/contracts-notifications";

const authHeaderSchema = z.object({
  authorization: z.string().startsWith("Bearer ").optional()
});
const orderIdParamsSchema = z.object({ orderId: z.string().uuid() });
const cancelOrderRequestSchema = z.object({ reason: z.string().min(1) });

function unauthorized(requestId: string) {
  return apiErrorSchema.parse({
    code: "UNAUTHORIZED",
    message: "Missing or invalid auth token",
    requestId
  });
}

const authSuccessSchema = z.object({ success: z.literal(true) });

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
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  responseSchema: z.ZodType<TResponse>;
}) {
  const { request, reply, baseUrl, serviceLabel, method, path, body, responseSchema } = params;

  const headers: Record<string, string> = {
    "x-request-id": request.id
  };
  const authorization = request.headers.authorization;

  if (typeof authorization === "string") {
    headers.authorization = authorization;
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
  const loyaltyBaseUrl = process.env.LOYALTY_SERVICE_BASE_URL ?? "http://127.0.0.1:3004";

  app.get("/health", async () => ({ status: "ok", service: "gateway" }));
  app.get("/ready", async () => ({ status: "ready", service: "gateway" }));

  app.get("/v1/meta/contracts", async () => ({
    auth: authContract.basePath,
    catalog: catalogContract.basePath,
    orders: ordersContract.basePath,
    loyalty: loyaltyContract.basePath,
    notifications: notificationsContract.basePath
  }));

  app.post("/v1/auth/apple/exchange", async (request, reply) => {
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
  });

  app.post("/v1/auth/passkey/register/challenge", async (request, reply) => {
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
  });

  app.post("/v1/auth/passkey/register/verify", async (request, reply) => {
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
  });

  app.post("/v1/auth/passkey/auth/challenge", async (request, reply) => {
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
  });

  app.post("/v1/auth/passkey/auth/verify", async (request, reply) => {
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
  });

  app.post("/v1/auth/magic-link/request", async (request, reply) => {
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
  });

  app.post("/v1/auth/magic-link/verify", async (request, reply) => {
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
  });

  app.post("/v1/auth/refresh", async (request, reply) => {
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
  });

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
    const parsed = authHeaderSchema.safeParse(request.headers);
    if (!parsed.success || !parsed.data.authorization) {
      return reply.status(401).send(unauthorized(request.id));
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
    const parsed = authHeaderSchema.safeParse(request.headers);
    if (!parsed.success || !parsed.data.authorization) {
      return reply.status(401).send(unauthorized(request.id));
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

  app.get("/v1/menu", async () => {
    return menuResponseSchema.parse({
      locationId: "flagship-01",
      currency: "USD",
      categories: []
    });
  });

  app.get("/v1/store/config", async () => {
    return storeConfigResponseSchema.parse({
      locationId: "flagship-01",
      prepEtaMinutes: 12,
      taxRateBasisPoints: 600,
      pickupInstructions: "Pickup at the flagship order counter."
    });
  });

  app.post("/v1/orders/quote", async (request, reply) => {
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
  });

  app.post("/v1/orders", async (request, reply) => {
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
  });

  app.post("/v1/orders/:orderId/pay", async (request, reply) => {
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
  });

  app.get("/v1/orders", async (request, reply) =>
    proxyUpstream({
      request,
      reply,
      baseUrl: ordersBaseUrl,
      serviceLabel: "Orders",
      method: "GET",
      path: "/v1/orders",
      responseSchema: z.array(orderSchema)
    })
  );

  app.get("/v1/orders/:orderId", async (request, reply) => {
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

  app.post("/v1/orders/:orderId/cancel", async (request, reply) => {
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
  });

  app.get("/v1/loyalty/balance", async (request, reply) =>
    proxyUpstream({
      request,
      reply,
      baseUrl: loyaltyBaseUrl,
      serviceLabel: "Loyalty",
      method: "GET",
      path: "/v1/loyalty/balance",
      responseSchema: loyaltyBalanceSchema
    })
  );

  app.get("/v1/loyalty/ledger", async (request, reply) =>
    proxyUpstream({
      request,
      reply,
      baseUrl: loyaltyBaseUrl,
      serviceLabel: "Loyalty",
      method: "GET",
      path: "/v1/loyalty/ledger",
      responseSchema: z.array(loyaltyLedgerEntrySchema)
    })
  );

  app.put("/v1/devices/push-token", async (request) => {
    pushTokenUpsertSchema.parse(request.body);
    return { success: true };
  });
}
