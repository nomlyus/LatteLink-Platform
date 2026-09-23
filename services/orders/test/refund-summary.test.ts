import { describe, expect, it } from "vitest";
import { countUnverifiedRefunds } from "../src/repository.js";

describe("refund verification summary", () => {
  it("clears a legacy warning only when verified Stripe refunds exactly cover its amount", () => {
    const legacy = {
      payment_id: "pi_legacy",
      amount_cents: 371,
      currency: "USD",
      status: "REFUNDED",
      source: "LEGACY_SIMULATED"
    };
    const rows = [
      legacy,
      { ...legacy, payment_id: "pi_unresolved" },
      { ...legacy, payment_id: "pi_rejected", status: "REJECTED" },
      { ...legacy, payment_id: "pi_legacy", amount_cents: 200, source: "STRIPE_VERIFIED" },
      { ...legacy, payment_id: "pi_legacy", amount_cents: 171, source: "STRIPE_VERIFIED" }
    ];

    expect(countUnverifiedRefunds(rows)).toBe(1);
    expect(rows[0]).toEqual(legacy);
  });

  it("keeps the warning for a short or differently scoped provider refund total", () => {
    const legacy = {
      payment_id: "pi_legacy",
      amount_cents: 371,
      currency: "USD",
      status: "REFUNDED",
      source: "LEGACY_SIMULATED"
    };
    const shortfall = [
      legacy,
      { ...legacy, amount_cents: 370, source: "STRIPE_VERIFIED" }
    ];
    const wrongPayment = [
      legacy,
      { ...legacy, payment_id: "pi_other", source: "STRIPE_VERIFIED" }
    ];

    expect(countUnverifiedRefunds(shortfall)).toBe(1);
    expect(countUnverifiedRefunds(wrongPayment)).toBe(1);
  });

  it("keeps ambiguous duplicate legacy rows unresolved even when the verified sum matches one row", () => {
    const legacy = {
      payment_id: "pi_duplicate_legacy",
      amount_cents: 371,
      currency: "USD",
      status: "REFUNDED",
      source: "LEGACY_SIMULATED"
    };
    const rows = [
      { ...legacy, refund_id: "legacy-1" },
      { ...legacy, refund_id: "legacy-2" },
      { ...legacy, refund_id: "verified-1", source: "STRIPE_VERIFIED" }
    ];

    expect(countUnverifiedRefunds(rows)).toBe(2);
  });
});
