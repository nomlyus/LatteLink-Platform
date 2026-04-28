import { describe, expect, it } from "vitest";
import { loyaltyBalanceSchema } from "../src";

describe("contracts-loyalty", () => {
  it("accepts non-negative balances", () => {
    const value = loyaltyBalanceSchema.parse({
      userId: "123e4567-e89b-12d3-a456-426614174000",
      locationId: "rawaqcoffee01",
      availablePoints: 10,
      pendingPoints: 0,
      lifetimeEarned: 10
    });

    expect(value.availablePoints).toBe(10);
  });
});
