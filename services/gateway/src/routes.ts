import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiErrorSchema } from "@gazelle/contracts-core";
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

function unauthorized() {
  return apiErrorSchema.parse({
    code: "UNAUTHORIZED",
    message: "Missing or invalid auth token"
  });
}

const defaultUserId = "123e4567-e89b-12d3-a456-426614174000";

function buildSession(seed: string) {
  return {
    accessToken: `access-${seed}`,
    refreshToken: `refresh-${seed}`,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    userId: defaultUserId
  };
}

function buildPasskeyChallenge() {
  return passkeyChallengeResponseSchema.parse({
    challenge: crypto.randomUUID(),
    rpId: process.env.PASSKEY_RP_ID ?? "gazellecoffee.com",
    timeoutMs: 60_000
  });
}

export async function registerRoutes(app: FastifyInstance) {
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
    return reply.send(buildSession(input.nonce));
  });

  app.post("/v1/auth/passkey/register/challenge", async (request) => {
    passkeyChallengeRequestSchema.parse(request.body ?? {});
    return buildPasskeyChallenge();
  });

  app.post("/v1/auth/passkey/register/verify", async (request) => {
    passkeyVerifyRequestSchema.parse(request.body);
    return buildSession("passkey-register");
  });

  app.post("/v1/auth/passkey/auth/challenge", async (request) => {
    passkeyChallengeRequestSchema.parse(request.body ?? {});
    return buildPasskeyChallenge();
  });

  app.post("/v1/auth/passkey/auth/verify", async (request) => {
    passkeyVerifyRequestSchema.parse(request.body);
    return buildSession("passkey-auth");
  });

  app.post("/v1/auth/magic-link/request", async (request) => {
    const input = magicLinkRequestSchema.parse(request.body);
    app.log.info({ email: input.email }, "magic link requested");
    return { success: true as const };
  });

  app.post("/v1/auth/magic-link/verify", async (request) => {
    const input = magicLinkVerifySchema.parse(request.body);
    return buildSession(input.token);
  });

  app.post("/v1/auth/refresh", async (request) => {
    const input = refreshRequestSchema.parse(request.body);
    return buildSession(input.refreshToken);
  });

  app.post("/v1/auth/logout", async (request) => {
    logoutRequestSchema.parse(request.body);
    return { success: true as const };
  });

  app.get("/v1/auth/me", async (request, reply) => {
    const parsed = authHeaderSchema.safeParse(request.headers);
    if (!parsed.success || !parsed.data.authorization) {
      return reply.status(401).send(unauthorized());
    }

    return meResponseSchema.parse({
      userId: defaultUserId,
      email: "owner@gazellecoffee.com",
      methods: ["apple", "passkey", "magic-link"]
    });
  });

  app.get("/v1/me", async (request, reply) => {
    const parsed = authHeaderSchema.safeParse(request.headers);
    if (!parsed.success || !parsed.data.authorization) {
      return reply.status(401).send(unauthorized());
    }

    return meResponseSchema.parse({
      userId: defaultUserId,
      email: "owner@gazellecoffee.com",
      methods: ["apple", "passkey", "magic-link"]
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
