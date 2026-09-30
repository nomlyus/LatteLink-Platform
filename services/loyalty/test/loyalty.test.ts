import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loyaltyBalanceSchema,
  loyaltyLedgerEntrySchema,
  loyaltyProgramSchema
} from "@lattelink/contracts-loyalty";
import { z } from "zod";
import { buildApp } from "../src/app.js";

const mutationResponseSchema = z.object({
  entry: loyaltyLedgerEntrySchema,
  balance: loyaltyBalanceSchema
});
const gatewayToken = "loyalty-gateway-token";
const internalToken = "loyalty-internal-token";
const brandA = "northside-coffee";
const brandB = "harbor-coffee";
const locationA1 = "northside-01";
const locationA2 = "northside-02";
const locationB1 = "harbor-01";

function gatewayHeaders(userId: string) {
  return { "x-gateway-token": gatewayToken, "x-user-id": userId };
}

function internalHeaders() {
  return { "x-internal-token": internalToken };
}

async function configureProgram(
  app: Awaited<ReturnType<typeof buildApp>>,
  brandId: string,
  participatingLocationIds: string[],
  extra: Record<string, unknown> = {}
) {
  const response = await app.inject({
    method: "PUT",
    url: `/v1/loyalty/internal/programs/${brandId}`,
    headers: internalHeaders(),
    payload: {
      brandId,
      enabled: true,
      participatingLocationIds,
      pointsPerDollar: 1,
      redemptionCentsPerPoint: 1,
      minimumRedemptionPoints: 1,
      maximumRedemptionPercent: 100,
      excludedItemIds: [],
      ...extra
    }
  });
  expect(response.statusCode).toBe(200);
  return loyaltyProgramSchema.parse(response.json());
}

async function mutate(
  app: Awaited<ReturnType<typeof buildApp>>,
  input: Record<string, unknown>
) {
  return app.inject({
    method: "POST",
    url: "/v1/loyalty/internal/ledger/apply",
    headers: internalHeaders(),
    payload: input
  });
}

describe("loyalty service brand-wide balances", () => {
  beforeEach(() => {
    vi.stubEnv("GATEWAY_INTERNAL_API_TOKEN", gatewayToken);
    vi.stubEnv("LOYALTY_INTERNAL_API_TOKEN", internalToken);
    vi.stubEnv("BRAND_ID", "rawaqcoffee");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("returns the same brand balance and complete ledger from every participating location", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174401";
    await configureProgram(app, brandA, [locationA1, locationA2]);
    try {
      for (const [locationId, amountCents, idempotencyKey] of [
        [locationA1, 50_000, "a1-order"],
        [locationA2, 30_000, "a2-order"]
      ] as const) {
        const response = await mutate(app, {
          brandId: brandA, userId, locationId, type: "EARN", amountCents,
          idempotencyKey, orderId: "123e4567-e89b-12d3-a456-426614174511"
        });
        expect(response.statusCode).toBe(200);
      }

      for (const locationId of [locationA1, locationA2]) {
        const response = await app.inject({
          method: "GET",
          url: `/v1/loyalty/balance?brandId=${brandA}&locationId=${locationId}`,
          headers: gatewayHeaders(userId)
        });
        expect(response.statusCode).toBe(200);
        expect(loyaltyBalanceSchema.parse(response.json())).toEqual({
          brandId: brandA, userId, availablePoints: 800, pendingPoints: 0, lifetimeEarned: 800
        });
      }

      const ledgerResponse = await app.inject({
        method: "GET",
        url: `/v1/loyalty/ledger?brandId=${brandA}&locationId=${locationA2}`,
        headers: gatewayHeaders(userId)
      });
      expect(ledgerResponse.statusCode).toBe(200);
      const history = z.array(loyaltyLedgerEntrySchema).parse(ledgerResponse.json());
      expect(history.map(({ locationId }) => locationId).sort()).toEqual([locationA1, locationA2]);
    } finally {
      await app.close();
    }
  });

  it("keeps Brand B separate from Brand A for the same customer", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174402";
    await configureProgram(app, brandA, [locationA1, locationA2]);
    await configureProgram(app, brandB, [locationB1]);
    try {
      await mutate(app, { brandId: brandA, userId, locationId: locationA1, type: "EARN", amountCents: 15_000, idempotencyKey: "a-earn" });
      await mutate(app, { brandId: brandB, userId, locationId: locationB1, type: "EARN", amountCents: 7_000, idempotencyKey: "b-earn" });
      const [a, b] = await Promise.all([locationA1, locationB1].map((locationId, index) =>
        app.inject({
          method: "GET",
          url: `/v1/loyalty/balance?brandId=${index === 0 ? brandA : brandB}&locationId=${locationId}`,
          headers: gatewayHeaders(userId)
        })
      ));
      expect(loyaltyBalanceSchema.parse(a.json()).availablePoints).toBe(150);
      expect(loyaltyBalanceSchema.parse(b.json()).availablePoints).toBe(70);

      const crossBrand = await app.inject({
        method: "GET",
        url: `/v1/loyalty/ledger?brandId=${brandA}&locationId=${locationB1}`,
        headers: gatewayHeaders(userId)
      });
      expect(crossBrand.statusCode).toBe(404);
      expect(crossBrand.json()).toMatchObject({ code: "LOYALTY_LOCATION_NOT_AVAILABLE" });
    } finally {
      await app.close();
    }
  });

  it("allows earning at A1 and redeeming the same points at A2", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174403";
    await configureProgram(app, brandA, [locationA1, locationA2]);
    try {
      const earned = await mutate(app, {
        brandId: brandA, userId, locationId: locationA1, type: "EARN", amountCents: 100_000, idempotencyKey: "cross-location-earn"
      });
      expect(earned.statusCode).toBe(200);
      const redeemed = await mutate(app, {
        brandId: brandA, userId, locationId: locationA2, type: "REDEEM", amountCents: 250,
        points: 250, idempotencyKey: "cross-location-redeem"
      });
      expect(redeemed.statusCode).toBe(200);
      expect(mutationResponseSchema.parse(redeemed.json())).toMatchObject({
        entry: { type: "REDEEM", points: -250, locationId: locationA2 },
        balance: { brandId: brandA, availablePoints: 750 }
      });
    } finally {
      await app.close();
    }
  });

  it("uses configured earn and redemption rules and rejects insufficient or nonparticipating use", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174404";
    await configureProgram(app, brandA, [locationA1], {
      pointsPerDollar: 2,
      redemptionCentsPerPoint: 5,
      minimumRedemptionPoints: 10,
      maximumRedemptionPercent: 50,
      excludedItemIds: ["excluded-item"]
    });
    try {
      const context = await app.inject({
        method: "GET",
        url: `/v1/loyalty/internal/program-context?brandId=${brandA}&locationId=${locationA1}`,
        headers: internalHeaders()
      });
      expect(context.json()).toMatchObject({ pointsPerDollar: 2, redemptionCentsPerPoint: 5, excludedItemIds: ["excluded-item"] });

      const earn = await mutate(app, {
        brandId: brandA, userId, locationId: locationA1, type: "EARN", amountCents: 1_000,
        idempotencyKey: "configured-earn"
      });
      expect(mutationResponseSchema.parse(earn.json()).balance.availablePoints).toBe(20);

      const mismatch = await mutate(app, {
        brandId: brandA, userId, locationId: locationA1, type: "REDEEM", amountCents: 25,
        points: 5, idempotencyKey: "too-few-points"
      });
      expect(mismatch.statusCode).toBe(409);
      expect(mismatch.json()).toMatchObject({ code: "LOYALTY_REDEMPTION_RULE_MISMATCH" });

      const insufficient = await mutate(app, {
        brandId: brandA, userId, locationId: locationA1, type: "REDEEM", amountCents: 150,
        points: 30, idempotencyKey: "insufficient-points"
      });
      expect(insufficient.statusCode).toBe(409);
      expect(insufficient.json()).toMatchObject({ code: "INSUFFICIENT_POINTS" });

      const nonParticipant = await mutate(app, {
        brandId: brandA, userId, locationId: locationA2, type: "EARN", amountCents: 10_000,
        idempotencyKey: "nonparticipant-earn"
      });
      expect(nonParticipant.statusCode).toBe(404);
      expect(nonParticipant.json()).toMatchObject({ code: "LOYALTY_LOCATION_NOT_AVAILABLE" });
    } finally {
      await app.close();
    }
  });

  it("reverses refunds at their original location and replays duplicate events once", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174405";
    const orderId = "123e4567-e89b-12d3-a456-426614174515";
    await configureProgram(app, brandA, [locationA1, locationA2]);
    try {
      await mutate(app, {
        brandId: brandA, userId, locationId: locationA1, orderId, type: "EARN",
        amountCents: 12_000, idempotencyKey: "refund-original-earn"
      });
      const refundInput = {
        brandId: brandA, userId, locationId: locationA1, orderId,
        type: "ADJUSTMENT", points: -120, idempotencyKey: "refund-reverse-earn"
      };
      const first = await mutate(app, refundInput);
      const replay = await mutate(app, refundInput);
      expect(first.statusCode).toBe(200);
      expect(replay.statusCode).toBe(200);
      expect(mutationResponseSchema.parse(first.json()).entry).toMatchObject({ type: "ADJUSTMENT", points: -120, locationId: locationA1 });

      await mutate(app, {
        brandId: brandA, userId, locationId: locationA2, orderId, type: "EARN",
        amountCents: 5_000, idempotencyKey: "refund-redeemed-earn"
      });
      const redemption = await mutate(app, {
        brandId: brandA, userId, locationId: locationA2, orderId,
        type: "REDEEM", amountCents: 10, points: 10, idempotencyKey: "refund-redeem"
      });
      expect(redemption.statusCode).toBe(200);
      const refundRedeemInput = {
        brandId: brandA, userId, locationId: locationA2, orderId,
        type: "REFUND", amountCents: 10, points: 10, idempotencyKey: "refund-redeem-points"
      };
      await mutate(app, refundRedeemInput);
      await mutate(app, refundRedeemInput);

      const balance = await app.inject({
        method: "GET", url: `/v1/loyalty/balance?brandId=${brandA}&locationId=${locationA1}`,
        headers: gatewayHeaders(userId)
      });
      expect(loyaltyBalanceSchema.parse(balance.json()).availablePoints).toBe(50);
      const history = await app.inject({
        method: "GET", url: `/v1/loyalty/ledger?brandId=${brandA}&locationId=${locationA2}`,
        headers: gatewayHeaders(userId)
      });
      expect(z.array(loyaltyLedgerEntrySchema).parse(history.json())).toHaveLength(5);
    } finally {
      await app.close();
    }
  });

  it("scopes idempotency by brand/customer rather than location", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174406";
    await configureProgram(app, brandA, [locationA1, locationA2]);
    try {
      const firstInput = {
        brandId: brandA, userId, locationId: locationA1, type: "EARN",
        amountCents: 1_000, idempotencyKey: "one-brand-event"
      };
      expect((await mutate(app, firstInput)).statusCode).toBe(200);
      const crossLocationReuse = await mutate(app, { ...firstInput, locationId: locationA2 });
      expect(crossLocationReuse.statusCode).toBe(409);
      expect(crossLocationReuse.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSE" });
      const balance = await app.inject({
        method: "GET", url: `/v1/loyalty/balance?brandId=${brandA}&locationId=${locationA2}`,
        headers: gatewayHeaders(userId)
      });
      expect(loyaltyBalanceSchema.parse(balance.json()).availablePoints).toBe(10);
    } finally {
      await app.close();
    }
  });

  it("fails closed on missing brand context and rejects cross-brand program membership", async () => {
    const app = await buildApp();
    const userId = "123e4567-e89b-12d3-a456-426614174407";
    await configureProgram(app, brandA, [locationA1]);
    await configureProgram(app, brandB, [locationB1]);
    try {
      const missingBrand = await app.inject({
        method: "GET", url: `/v1/loyalty/balance?locationId=${locationA1}`,
        headers: gatewayHeaders(userId)
      });
      expect(missingBrand.statusCode).toBe(400);

      const crossBrand = await mutate(app, {
        brandId: brandA, userId, locationId: locationB1,
        type: "EARN", amountCents: 10_000, idempotencyKey: "cross-brand-earn"
      });
      expect(crossBrand.statusCode).toBe(404);

      const noFallback = await app.inject({
        method: "GET", url: `/v1/loyalty/balance?brandId=rawaqcoffee&locationId=rawaqcoffee01`,
        headers: gatewayHeaders(userId)
      });
      expect(noFallback.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("validates program location membership and versioned updates", async () => {
    const app = await buildApp();
    try {
      await configureProgram(app, brandA, [locationA1]);
      await configureProgram(app, brandB, [locationB1]);
      const update = await app.inject({
        method: "PUT", url: `/v1/loyalty/internal/programs/${brandA}`,
        headers: internalHeaders(),
        payload: {
          brandId: brandA, enabled: true, participatingLocationIds: [locationA1, locationA2],
          pointsPerDollar: 1, redemptionCentsPerPoint: 1, minimumRedemptionPoints: 1,
          maximumRedemptionPercent: 100, excludedItemIds: []
        }
      });
      expect(update.statusCode).toBe(200);
      expect(loyaltyProgramSchema.parse(update.json()).version).toBe(2);

      const invalid = await app.inject({
        method: "PUT", url: `/v1/loyalty/internal/programs/${brandA}`,
        headers: internalHeaders(),
        payload: {
          brandId: brandA, enabled: true, participatingLocationIds: [locationB1],
          pointsPerDollar: 1, redemptionCentsPerPoint: 1, minimumRedemptionPoints: 1,
          maximumRedemptionPercent: 100, excludedItemIds: []
        }
      });
      expect(invalid.statusCode).toBe(409);
      expect(invalid.json()).toMatchObject({ code: "LOYALTY_PROGRAM_LOCATION_MISMATCH" });
    } finally {
      await app.close();
    }
  });

  it("keeps gateway/internal authentication and mutation rate limits", async () => {
    const app = await buildApp();
    await configureProgram(app, brandA, [locationA1]);
    const userId = "123e4567-e89b-12d3-a456-426614174408";
    try {
      const unauthorized = await app.inject({
        method: "GET", url: `/v1/loyalty/balance?brandId=${brandA}&locationId=${locationA1}`,
        headers: { "x-user-id": userId }
      });
      expect(unauthorized.statusCode).toBe(401);
      expect(unauthorized.json()).toMatchObject({ code: "UNAUTHORIZED_GATEWAY_REQUEST" });

      const missingInternal = await app.inject({
        method: "POST", url: "/v1/loyalty/internal/ledger/apply",
        payload: { brandId: brandA, userId, locationId: locationA1, type: "EARN", amountCents: 100, idempotencyKey: "no-token" }
      });
      expect(missingInternal.statusCode).toBe(401);

      vi.stubEnv("LOYALTY_RATE_LIMIT_MUTATION_MAX", "1");
      vi.stubEnv("LOYALTY_RATE_LIMIT_WINDOW_MS", "60000");
      const limitedApp = await buildApp();
      try {
        await configureProgram(limitedApp, brandA, [locationA1]);
        expect((await mutate(limitedApp, { brandId: brandA, userId, locationId: locationA1, type: "EARN", amountCents: 100, idempotencyKey: "rate-1" })).statusCode).toBe(200);
        expect((await mutate(limitedApp, { brandId: brandA, userId, locationId: locationA1, type: "EARN", amountCents: 100, idempotencyKey: "rate-2" })).statusCode).toBe(429);
      } finally {
        await limitedApp.close();
      }
    } finally {
      await app.close();
    }
  });
});
