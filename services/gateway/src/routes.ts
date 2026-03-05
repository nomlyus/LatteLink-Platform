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
import { ordersContract, createOrderRequestSchema, orderQuoteSchema, orderSchema, payOrderRequestSchema, quoteRequestSchema } from "@gazelle/contracts-orders";
import { loyaltyBalanceSchema, loyaltyContract, loyaltyLedgerEntrySchema } from "@gazelle/contracts-loyalty";
import { notificationsContract, pushTokenUpsertSchema } from "@gazelle/contracts-notifications";

const authHeaderSchema = z.object({
  authorization: z.string().startsWith("Bearer ").optional()
});

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

async function proxyIdentity<TResponse>(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  baseUrl: string;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  responseSchema: z.ZodType<TResponse>;
}) {
  const { request, reply, baseUrl, method, path, body, responseSchema } = params;

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
        message: "Identity service is unavailable",
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
        message: `Identity request failed with status ${upstreamResponse.status}`,
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
        message: "Identity response did not match contract",
        requestId: request.id,
        details: parsedResponse.error.flatten()
      })
    );
  }

  return reply.status(upstreamResponse.status).send(parsedResponse.data);
}

export async function registerRoutes(app: FastifyInstance) {
  const identityBaseUrl = process.env.IDENTITY_SERVICE_BASE_URL ?? "http://127.0.0.1:3000";

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

    return proxyIdentity({
      request,
      reply,
      baseUrl: identityBaseUrl,
      method: "POST",
      path: "/v1/auth/apple/exchange",
      body: input,
      responseSchema: authSessionSchema
    });
  });

  app.post("/v1/auth/passkey/register/challenge", async (request, reply) => {
    const input = passkeyChallengeRequestSchema.parse(request.body ?? {});

    return proxyIdentity({
      request,
      reply,
      baseUrl: identityBaseUrl,
      method: "POST",
      path: "/v1/auth/passkey/register/challenge",
      body: input,
      responseSchema: passkeyChallengeResponseSchema
    });
  });

  app.post("/v1/auth/passkey/register/verify", async (request, reply) => {
    const input = passkeyVerifyRequestSchema.parse(request.body);

    return proxyIdentity({
      request,
      reply,
      baseUrl: identityBaseUrl,
      method: "POST",
      path: "/v1/auth/passkey/register/verify",
      body: input,
      responseSchema: authSessionSchema
    });
  });

  app.post("/v1/auth/passkey/auth/challenge", async (request, reply) => {
    const input = passkeyChallengeRequestSchema.parse(request.body ?? {});

    return proxyIdentity({
      request,
      reply,
      baseUrl: identityBaseUrl,
      method: "POST",
      path: "/v1/auth/passkey/auth/challenge",
      body: input,
      responseSchema: passkeyChallengeResponseSchema
    });
  });

  app.post("/v1/auth/passkey/auth/verify", async (request, reply) => {
    const input = passkeyVerifyRequestSchema.parse(request.body);

    return proxyIdentity({
      request,
      reply,
      baseUrl: identityBaseUrl,
      method: "POST",
      path: "/v1/auth/passkey/auth/verify",
      body: input,
      responseSchema: authSessionSchema
    });
  });

  app.post("/v1/auth/magic-link/request", async (request, reply) => {
    const input = magicLinkRequestSchema.parse(request.body);

    return proxyIdentity({
      request,
      reply,
      baseUrl: identityBaseUrl,
      method: "POST",
      path: "/v1/auth/magic-link/request",
      body: input,
      responseSchema: authSuccessSchema
    });
  });

  app.post("/v1/auth/magic-link/verify", async (request, reply) => {
    const input = magicLinkVerifySchema.parse(request.body);

    return proxyIdentity({
      request,
      reply,
      baseUrl: identityBaseUrl,
      method: "POST",
      path: "/v1/auth/magic-link/verify",
      body: input,
      responseSchema: authSessionSchema
    });
  });

  app.post("/v1/auth/refresh", async (request, reply) => {
    const input = refreshRequestSchema.parse(request.body);

    return proxyIdentity({
      request,
      reply,
      baseUrl: identityBaseUrl,
      method: "POST",
      path: "/v1/auth/refresh",
      body: input,
      responseSchema: authSessionSchema
    });
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const input = logoutRequestSchema.parse(request.body);

    return proxyIdentity({
      request,
      reply,
      baseUrl: identityBaseUrl,
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

    return proxyIdentity({
      request,
      reply,
      baseUrl: identityBaseUrl,
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

    return proxyIdentity({
      request,
      reply,
      baseUrl: identityBaseUrl,
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

  app.post("/v1/orders/quote", async (request) => {
    const input = quoteRequestSchema.parse(request.body);

    return orderQuoteSchema.parse({
      quoteId: "123e4567-e89b-12d3-a456-426614174001",
      locationId: input.locationId,
      items: input.items.map((item) => ({
        itemId: item.itemId,
        quantity: item.quantity,
        unitPriceCents: 500
      })),
      subtotal: { currency: "USD", amountCents: 500 },
      discount: { currency: "USD", amountCents: 0 },
      tax: { currency: "USD", amountCents: 30 },
      total: { currency: "USD", amountCents: 530 },
      pointsToRedeem: input.pointsToRedeem,
      quoteHash: "quote-hash"
    });
  });

  app.post("/v1/orders", async (request) => {
    const input = createOrderRequestSchema.parse(request.body);

    return orderSchema.parse({
      id: "123e4567-e89b-12d3-a456-426614174002",
      locationId: "flagship-01",
      status: "PENDING_PAYMENT",
      items: [],
      total: { currency: "USD", amountCents: 530 },
      pickupCode: input.quoteHash.slice(0, 6),
      timeline: [
        {
          status: "PENDING_PAYMENT",
          occurredAt: new Date().toISOString()
        }
      ]
    });
  });

  app.post("/v1/orders/:orderId/pay", async (request) => {
    const { orderId } = request.params as { orderId: string };
    const input = payOrderRequestSchema.parse(request.body);

    return orderSchema.parse({
      id: orderId,
      locationId: "flagship-01",
      status: "PAID",
      items: [],
      total: { currency: "USD", amountCents: 530 },
      pickupCode: input.idempotencyKey.slice(0, 6),
      timeline: [
        {
          status: "PAID",
          occurredAt: new Date().toISOString(),
          note: "Payment accepted"
        }
      ]
    });
  });

  app.get("/v1/orders", async () => z.array(orderSchema).parse([]));

  app.get("/v1/orders/:orderId", async (request) => {
    const { orderId } = request.params as { orderId: string };

    return orderSchema.parse({
      id: orderId,
      locationId: "flagship-01",
      status: "IN_PREP",
      items: [],
      total: { currency: "USD", amountCents: 530 },
      pickupCode: "ABC123",
      timeline: [
        {
          status: "IN_PREP",
          occurredAt: new Date().toISOString()
        }
      ]
    });
  });

  app.post("/v1/orders/:orderId/cancel", async (request) => {
    const { orderId } = request.params as { orderId: string };

    return orderSchema.parse({
      id: orderId,
      locationId: "flagship-01",
      status: "CANCELED",
      items: [],
      total: { currency: "USD", amountCents: 0 },
      pickupCode: "CANCEL",
      timeline: [
        {
          status: "CANCELED",
          occurredAt: new Date().toISOString(),
          note: "Canceled by customer"
        }
      ]
    });
  });

  app.get("/v1/loyalty/balance", async () => {
    return loyaltyBalanceSchema.parse({
      userId: "123e4567-e89b-12d3-a456-426614174000",
      availablePoints: 120,
      pendingPoints: 10,
      lifetimeEarned: 130
    });
  });

  app.get("/v1/loyalty/ledger", async () => {
    return z.array(loyaltyLedgerEntrySchema).parse([
      {
        id: "123e4567-e89b-12d3-a456-426614174010",
        type: "EARN",
        points: 10,
        orderId: "123e4567-e89b-12d3-a456-426614174002",
        createdAt: new Date().toISOString()
      }
    ]);
  });

  app.put("/v1/devices/push-token", async (request) => {
    pushTokenUpsertSchema.parse(request.body);
    return { success: true };
  });
}
