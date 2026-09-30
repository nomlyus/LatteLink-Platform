import { describe, expect, it } from "vitest";
import type { OperatorDiscountCode } from "../src/model";
import {
  filterDiscountCodes,
  getDiscountCodeStatus,
  toDiscountDateTimeInputValue,
  validateDiscountCodeForm
} from "../src/features/discounts/discounts-domain";

const baseCode: OperatorDiscountCode = {
  discountCodeId: "11111111-1111-4111-8111-111111111111",
  locationId: "loc-a",
  code: "WELCOME10",
  name: "Welcome offer",
  type: "percent",
  value: 10,
  maxDiscountCents: 500,
  minSubtotalCents: 0,
  eligibility: "everyone",
  oncePerCustomer: false,
  maxTotalRedemptions: 4,
  active: true,
  redeemedCount: 2,
  reservedCount: 1,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

function validCreateForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  const values = {
    code: "  launch10  ",
    name: "Launch offer",
    type: "percent",
    value: "10",
    maxDiscountCents: "500",
    minSubtotalCents: "0",
    eligibility: "everyone",
    maxTotalRedemptions: "25",
    startsAt: "2026-10-01T08:30",
    expiresAt: "2026-10-31T23:59",
    oncePerCustomer: "on",
    active: "on",
    ...overrides
  };
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

describe("discount code domain", () => {
  it("classifies live status using server fields and server-equivalent precedence", () => {
    const now = Date.parse("2026-09-15T12:00:00.000Z");
    expect(getDiscountCodeStatus(baseCode, now)).toBe("active");
    expect(getDiscountCodeStatus({ ...baseCode, active: false, expiresAt: "2026-09-01T00:00:00.000Z" }, now)).toBe("inactive");
    expect(getDiscountCodeStatus({ ...baseCode, startsAt: "2026-09-15T12:00:00.001Z" }, now)).toBe("upcoming");
    expect(getDiscountCodeStatus({ ...baseCode, expiresAt: "2026-09-15T12:00:00.000Z" }, now)).toBe("expired");
    expect(getDiscountCodeStatus({ ...baseCode, redeemedCount: 3, reservedCount: 1 }, now)).toBe("exhausted");
  });

  it("filters by code/name and current derived status", () => {
    const upcoming = { ...baseCode, discountCodeId: "22222222-2222-4222-8222-222222222222", code: "FUTURE", name: "Autumn", startsAt: "2026-10-01T00:00:00.000Z" };
    expect(filterDiscountCodes([baseCode, upcoming], "welcome", "all")).toEqual([baseCode]);
    expect(filterDiscountCodes([baseCode, upcoming], "", "upcoming", Date.parse("2026-09-15T00:00:00.000Z"))).toEqual([upcoming]);
  });

  it("validates percentage, fixed amount, thresholds, and schedule relationships", () => {
    const invalidPercent = validateDiscountCodeForm(validCreateForm({ value: "101" }), "create");
    expect(invalidPercent.valid).toBe(false);
    if (!invalidPercent.valid) expect(invalidPercent.errors.value).toContain("100");

    const fractionalMinimum = validateDiscountCodeForm(validCreateForm({ minSubtotalCents: "0.5" }), "create");
    expect(fractionalMinimum.valid).toBe(false);
    if (!fractionalMinimum.valid) expect(fractionalMinimum.errors.minSubtotalCents).toBeDefined();

    const invalidWindow = validateDiscountCodeForm(validCreateForm({
      startsAt: "2026-10-31T23:59",
      expiresAt: "2026-10-01T08:30"
    }), "create");
    expect(invalidWindow.valid).toBe(false);
    if (!invalidWindow.valid) expect(invalidWindow.errors.expiresAt).toContain("after startsAt");

    const invalidFixed = validateDiscountCodeForm(validCreateForm({ type: "fixed_cents", maxDiscountCents: "500" }), "create");
    expect(invalidFixed.valid).toBe(true);
    if (invalidFixed.valid) expect(invalidFixed.input.maxDiscountCents).toBeUndefined();
  });

  it("normalizes code and keeps local datetime entry mapped to the same absolute instant", () => {
    const localStartsAt = "2026-10-01T08:30";
    const result = validateDiscountCodeForm(validCreateForm({ startsAt: localStartsAt }), "create");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.input.code).toBe("LAUNCH10");
      expect(Date.parse(result.input.startsAt ?? "")).toBe(new Date(localStartsAt).getTime());
    }

    const timestamp = "2026-10-01T12:30:00.000Z";
    const expectedLocalValue = new Date(Date.parse(timestamp) - new Date(timestamp).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    expect(toDiscountDateTimeInputValue(timestamp)).toBe(expectedLocalValue);
    expect(toDiscountDateTimeInputValue(undefined)).toBe("");
  });

  it("clears optional update values explicitly without changing server update semantics", () => {
    const formData = new FormData();
    formData.set("name", "Welcome offer");
    formData.set("type", "percent");
    formData.set("value", "10");
    formData.set("minSubtotalCents", "0");
    formData.set("eligibility", "everyone");
    formData.set("active", "on");

    const result = validateDiscountCodeForm(formData, "update");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.input.maxDiscountCents).toBeNull();
      expect(result.input.maxTotalRedemptions).toBeNull();
      expect(result.input.startsAt).toBeNull();
      expect(result.input.expiresAt).toBeNull();
    }
  });
});
