import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loyaltyBalanceSchema, loyaltyLedgerEntrySchema } from "@lattelink/contracts-loyalty";
import { z } from "zod";
import { buildApp } from "../src/app.js";

const mutationResponseSchema = z.object({
  entry: loyaltyLedgerEntrySchema,
  balance: loyaltyBalanceSchema
});

const loyaltyGatewayToken = "loyalty-gateway-token";
const loyaltyInternalToken = "loyalty-internal-token";
const defaultLocationId = "rawaqcoffee01";
const loyaltyBalanceUrl = `/v1/loyalty/balance?locationId=${defaultLocationId}`;
const loyaltyLedgerUrl = `/v1/loyalty/ledger?locationId=${defaultLocationId}`;

function gatewayHeaders(extraHeaders?: Record<string, string>) {
  return {
    "x-gateway-token": loyaltyGatewayToken,
    ...extraHeaders
  };
}

function internalHeaders(extraHeaders?: Record<string, string>) {
  return {
    "x-internal-token": loyaltyInternalToken,
    ...extraHeaders
  };
}

describe("loyalty service", () => {
  beforeEach(() => {
    vi.stubEnv("GATEWAY_INTERNAL_API_TOKEN", loyaltyGatewayToken);
    vi.stubEnv("LOYALTY_INTERNAL_API_TOKEN", loyaltyInternalToken);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a zeroed balance and empty ledger for a new user", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174401";

    const balanceResponse = await app.inject({
      method: "GET",
      url: loyaltyBalanceUrl,
      headers: gatewayHeaders({ "x-user-id": userId })
    });
    expect(balanceResponse.statusCode).toBe(200);
    expect(loyaltyBalanceSchema.parse(balanceResponse.json())).toEqual({
      userId,
      locationId: defaultLocationId,
      availablePoints: 0,
      pendingPoints: 0,
      lifetimeEarned: 0
    });

    const ledgerResponse = await app.inject({
      method: "GET",
      url: loyaltyLedgerUrl,
      headers: gatewayHeaders({ "x-user-id": userId })
    });
    expect(ledgerResponse.statusCode).toBe(200);
    expect(z.array(loyaltyLedgerEntrySchema).parse(ledgerResponse.json())).toEqual([]);

    await app.close();
  });

  it("applies earn, redeem, refund, and adjustment mutations with deterministic accounting", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174402";
    const orderId = "123e4567-e89b-12d3-a456-426614174512";

    const earnResponse = await app.inject({
      method: "POST",
      url: "/v1/loyalty/internal/ledger/apply",
      headers: internalHeaders(),
      payload: {
        userId,
        locationId: defaultLocationId,
        orderId,
        type: "EARN",
        amountCents: 500,
        idempotencyKey: "evt-earn-1",
        occurredAt: "2026-03-10T10:00:00.000Z"
      }
    });
    expect(earnResponse.statusCode).toBe(200);
    expect(mutationResponseSchema.parse(earnResponse.json())).toMatchObject({
      entry: { type: "EARN", points: 500 },
      balance: { availablePoints: 500, lifetimeEarned: 500 }
    });

    const redeemResponse = await app.inject({
      method: "POST",
      url: "/v1/loyalty/internal/ledger/apply",
      headers: internalHeaders(),
      payload: {
        userId,
        locationId: defaultLocationId,
        orderId,
        type: "REDEEM",
        amountCents: 120,
        idempotencyKey: "evt-redeem-1",
        occurredAt: "2026-03-10T10:01:00.000Z"
      }
    });
    expect(redeemResponse.statusCode).toBe(200);
    expect(mutationResponseSchema.parse(redeemResponse.json())).toMatchObject({
      entry: { type: "REDEEM", points: -120 },
      balance: { availablePoints: 380, lifetimeEarned: 500 }
    });

    const refundResponse = await app.inject({
      method: "POST",
      url: "/v1/loyalty/internal/ledger/apply",
      headers: internalHeaders(),
      payload: {
        userId,
        locationId: defaultLocationId,
        orderId,
        type: "REFUND",
        amountCents: 50,
        idempotencyKey: "evt-refund-1",
        occurredAt: "2026-03-10T10:02:00.000Z"
      }
    });
    expect(refundResponse.statusCode).toBe(200);
    expect(mutationResponseSchema.parse(refundResponse.json())).toMatchObject({
      entry: { type: "REFUND", points: 50 },
      balance: { availablePoints: 430, lifetimeEarned: 500 }
    });

    const adjustmentResponse = await app.inject({
      method: "POST",
      url: "/v1/loyalty/internal/ledger/apply",
      headers: internalHeaders(),
      payload: {
        userId,
        locationId: defaultLocationId,
        type: "ADJUSTMENT",
        points: -30,
        idempotencyKey: "evt-adjust-1",
        occurredAt: "2026-03-10T10:03:00.000Z"
      }
    });
    expect(adjustmentResponse.statusCode).toBe(200);
    expect(mutationResponseSchema.parse(adjustmentResponse.json())).toMatchObject({
      entry: { type: "ADJUSTMENT", points: -30 },
      balance: { availablePoints: 400, lifetimeEarned: 500 }
    });

    const balanceResponse = await app.inject({
      method: "GET",
      url: loyaltyBalanceUrl,
      headers: gatewayHeaders({ "x-user-id": userId })
    });
    expect(balanceResponse.statusCode).toBe(200);
    expect(loyaltyBalanceSchema.parse(balanceResponse.json())).toMatchObject({
      userId,
      locationId: defaultLocationId,
      availablePoints: 400,
      pendingPoints: 0,
      lifetimeEarned: 500
    });

    const ledgerResponse = await app.inject({
      method: "GET",
      url: loyaltyLedgerUrl,
      headers: gatewayHeaders({ "x-user-id": userId })
    });
    expect(ledgerResponse.statusCode).toBe(200);
    const ledger = z.array(loyaltyLedgerEntrySchema).parse(ledgerResponse.json());
    expect(ledger.map((entry) => entry.type)).toEqual(["ADJUSTMENT", "REFUND", "REDEEM", "EARN"]);
    expect(ledger.map((entry) => entry.points)).toEqual([-30, 50, -120, 500]);

    await app.close();
  });

  it("keeps balances and ledgers isolated by location for the same user", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174410";
    const northLocationId = "northside-01";

    const flagshipEarn = await app.inject({
      method: "POST",
      url: "/v1/loyalty/internal/ledger/apply",
      headers: internalHeaders(),
      payload: {
        userId,
        locationId: defaultLocationId,
        type: "EARN",
        amountCents: 500,
        idempotencyKey: "evt-location-flagship"
      }
    });
    expect(flagshipEarn.statusCode).toBe(200);

    const northEarn = await app.inject({
      method: "POST",
      url: "/v1/loyalty/internal/ledger/apply",
      headers: internalHeaders(),
      payload: {
        userId,
        locationId: northLocationId,
        type: "EARN",
        amountCents: 125,
        idempotencyKey: "evt-location-north"
      }
    });
    expect(northEarn.statusCode).toBe(200);

    const flagshipBalance = await app.inject({
      method: "GET",
      url: loyaltyBalanceUrl,
      headers: gatewayHeaders({ "x-user-id": userId })
    });
    expect(flagshipBalance.statusCode).toBe(200);
    expect(loyaltyBalanceSchema.parse(flagshipBalance.json())).toMatchObject({
      userId,
      locationId: defaultLocationId,
      availablePoints: 500,
      lifetimeEarned: 500
    });

    const northBalance = await app.inject({
      method: "GET",
      url: `/v1/loyalty/balance?locationId=${northLocationId}`,
      headers: gatewayHeaders({ "x-user-id": userId })
    });
    expect(northBalance.statusCode).toBe(200);
    expect(loyaltyBalanceSchema.parse(northBalance.json())).toMatchObject({
      userId,
      locationId: northLocationId,
      availablePoints: 125,
      lifetimeEarned: 125
    });

    const flagshipLedger = await app.inject({
      method: "GET",
      url: loyaltyLedgerUrl,
      headers: gatewayHeaders({ "x-user-id": userId })
    });
    expect(flagshipLedger.statusCode).toBe(200);
    expect(z.array(loyaltyLedgerEntrySchema).parse(flagshipLedger.json())).toHaveLength(1);

    const northLedger = await app.inject({
      method: "GET",
      url: `/v1/loyalty/ledger?locationId=${northLocationId}`,
      headers: gatewayHeaders({ "x-user-id": userId })
    });
    expect(northLedger.statusCode).toBe(200);
    expect(z.array(loyaltyLedgerEntrySchema).parse(northLedger.json())).toHaveLength(1);

    await app.close();
  });

  it("treats matching idempotency payloads as replay-safe and rejects mismatched re-use", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174403";

    const firstResponse = await app.inject({
      method: "POST",
      url: "/v1/loyalty/internal/ledger/apply",
      headers: internalHeaders(),
      payload: {
        userId,
        locationId: defaultLocationId,
        type: "EARN",
        amountCents: 200,
        idempotencyKey: "evt-repeat-1",
        occurredAt: "2026-03-10T11:00:00.000Z"
      }
    });
    expect(firstResponse.statusCode).toBe(200);
    const firstPayload = mutationResponseSchema.parse(firstResponse.json());

    const repeatedResponse = await app.inject({
      method: "POST",
      url: "/v1/loyalty/internal/ledger/apply",
      headers: internalHeaders(),
      payload: {
        userId,
        locationId: defaultLocationId,
        type: "EARN",
        amountCents: 200,
        idempotencyKey: "evt-repeat-1",
        occurredAt: "2026-03-10T11:30:00.000Z"
      }
    });
    expect(repeatedResponse.statusCode).toBe(200);
    const repeatedPayload = mutationResponseSchema.parse(repeatedResponse.json());
    expect(repeatedPayload.entry.id).toBe(firstPayload.entry.id);
    expect(repeatedPayload.balance).toEqual(firstPayload.balance);

    const conflictingResponse = await app.inject({
      method: "POST",
      url: "/v1/loyalty/internal/ledger/apply",
      headers: internalHeaders(),
      payload: {
        userId,
        locationId: defaultLocationId,
        type: "EARN",
        amountCents: 300,
        idempotencyKey: "evt-repeat-1",
        occurredAt: "2026-03-10T11:45:00.000Z"
      }
    });
    expect(conflictingResponse.statusCode).toBe(409);
    expect(conflictingResponse.json()).toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSE"
    });

    await app.close();
  });

  it("rejects a redeem mutation that would create a negative available balance", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174404";

    const response = await app.inject({
      method: "POST",
      url: "/v1/loyalty/internal/ledger/apply",
      headers: internalHeaders(),
      payload: {
        userId,
        locationId: defaultLocationId,
        type: "REDEEM",
        amountCents: 25,
        idempotencyKey: "evt-redeem-too-large"
      }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "INSUFFICIENT_POINTS"
    });

    await app.close();
  });

  it("rejects mutations where amountCents and points disagree", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174405";

    const response = await app.inject({
      method: "POST",
      url: "/v1/loyalty/internal/ledger/apply",
      headers: internalHeaders(),
      payload: {
        userId,
        locationId: defaultLocationId,
        type: "EARN",
        amountCents: 100,
        points: 99,
        idempotencyKey: "evt-invalid-points"
      }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "INVALID_LOYALTY_MUTATION"
    });

    await app.close();
  });

  it("rate limits internal ledger mutations when configured threshold is reached", async () => {
    vi.stubEnv("LOYALTY_RATE_LIMIT_MUTATION_MAX", "1");
    vi.stubEnv("LOYALTY_RATE_LIMIT_WINDOW_MS", "60000");
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174406";

    try {
      const firstMutation = await app.inject({
        method: "POST",
        url: "/v1/loyalty/internal/ledger/apply",
        headers: internalHeaders(),
        payload: {
          userId,
          locationId: defaultLocationId,
          type: "EARN",
          amountCents: 100,
          idempotencyKey: "evt-rate-limit-1"
        }
      });
      expect(firstMutation.statusCode).toBe(200);

      const secondMutation = await app.inject({
        method: "POST",
        url: "/v1/loyalty/internal/ledger/apply",
        headers: internalHeaders(),
        payload: {
          userId,
          locationId: defaultLocationId,
          type: "EARN",
          amountCents: 100,
          idempotencyKey: "evt-rate-limit-2"
        }
      });
      expect(secondMutation.statusCode).toBe(429);
    } finally {
      vi.unstubAllEnvs();
      await app.close();
    }
  });

  it("requires gateway token on customer routes when configured", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174406";

    const unauthorizedBalance = await app.inject({
      method: "GET",
      url: loyaltyBalanceUrl,
      headers: { "x-user-id": userId }
    });
    expect(unauthorizedBalance.statusCode).toBe(401);
    expect(unauthorizedBalance.json()).toMatchObject({
      code: "UNAUTHORIZED_GATEWAY_REQUEST"
    });

    const authorizedBalance = await app.inject({
      method: "GET",
      url: loyaltyBalanceUrl,
      headers: gatewayHeaders({
        "x-user-id": userId
      })
    });
    expect(authorizedBalance.statusCode).toBe(200);

    await app.close();
  });

  it("requires an internal token on loyalty mutation routes", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/loyalty/internal/ledger/apply",
      payload: {
        userId: "123e4567-e89b-12d3-a456-426614174407",
        locationId: defaultLocationId,
        type: "EARN",
        amountCents: 100,
        idempotencyKey: "evt-missing-internal-token"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "UNAUTHORIZED_INTERNAL_REQUEST"
    });

    await app.close();
  });

  it("fails closed when gateway auth is not configured", async () => {
    vi.stubEnv("GATEWAY_INTERNAL_API_TOKEN", "");
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: loyaltyBalanceUrl,
      headers: gatewayHeaders({
        "x-user-id": "123e4567-e89b-12d3-a456-426614174408"
      })
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: "GATEWAY_ACCESS_NOT_CONFIGURED"
    });

    await app.close();
  });

  it("fails closed when loyalty internal auth is not configured", async () => {
    vi.stubEnv("LOYALTY_INTERNAL_API_TOKEN", "");
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/loyalty/internal/ledger/apply",
      headers: internalHeaders(),
      payload: {
        userId: "123e4567-e89b-12d3-a456-426614174409",
        locationId: defaultLocationId,
        type: "EARN",
        amountCents: 100,
        idempotencyKey: "evt-missing-internal-config"
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: "INTERNAL_ACCESS_NOT_CONFIGURED"
    });

    await app.close();
  });
});
