import { describe, expect, it } from "vitest";
import { loyaltyBalanceSchema, loyaltyLedgerEntrySchema, loyaltyProgramUpdateSchema } from "../src";

describe("contracts-loyalty", () => {
  it("accepts non-negative balances", () => {
    const value = loyaltyBalanceSchema.parse({
      brandId: "northside-coffee",
      userId: "123e4567-e89b-12d3-a456-426614174000",
      availablePoints: 10,
      pendingPoints: 0,
      lifetimeEarned: 10
    });

    expect(value.availablePoints).toBe(10);
    expect(value).not.toHaveProperty("locationId");
  });

  it("keeps brand and store attribution on ledger history", () => {
    expect(ledgerEntry()).toMatchObject({
      brandId: "northside-coffee",
      userId: "123e4567-e89b-12d3-a456-426614174000",
      locationId: "northside-01"
    });
  });

  it("requires unique participating locations for an enabled program", () => {
    expect(() => loyaltyProgramUpdateSchema.parse({
      brandId: "northside-coffee",
      enabled: true,
      participatingLocationIds: ["northside-01", "northside-01"],
      pointsPerDollar: 1,
      redemptionCentsPerPoint: 1,
      minimumRedemptionPoints: 1,
      maximumRedemptionPercent: 100,
      excludedItemIds: []
    })).toThrow();
  });

  function ledgerEntry() {
    return loyaltyLedgerEntrySchema.parse({
      id: "123e4567-e89b-12d3-a456-426614174001",
      brandId: "northside-coffee",
      userId: "123e4567-e89b-12d3-a456-426614174000",
      type: "EARN",
      points: 10,
      locationId: "northside-01",
      createdAt: "2026-05-01T12:00:00.000Z"
    });
  }
});
