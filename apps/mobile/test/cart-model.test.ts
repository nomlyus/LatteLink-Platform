import { describe, expect, it } from "vitest";
import {
  DEFAULT_CUSTOMIZATION,
  addCartItem,
  buildPricingSummary,
  describeCustomization,
  getUnitPriceCents
} from "../src/cart/model";

describe("cart model", () => {
  it("merges line items with identical customization", () => {
    let items = addCartItem([], {
      menuItemId: "latte",
      name: "Latte",
      basePriceCents: 575,
      customization: { ...DEFAULT_CUSTOMIZATION, size: "Large" }
    });

    items = addCartItem(items, {
      menuItemId: "latte",
      name: "Latte",
      basePriceCents: 575,
      customization: { ...DEFAULT_CUSTOMIZATION, size: "Large" },
      quantity: 2
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(3);
  });

  it("creates separate lines for different customization", () => {
    let items = addCartItem([], {
      menuItemId: "latte",
      name: "Latte",
      basePriceCents: 575,
      customization: { ...DEFAULT_CUSTOMIZATION, milk: "Whole" }
    });

    items = addCartItem(items, {
      menuItemId: "latte",
      name: "Latte",
      basePriceCents: 575,
      customization: { ...DEFAULT_CUSTOMIZATION, milk: "Oat" }
    });

    expect(items).toHaveLength(2);
  });

  it("calculates customization price deltas and pricing summary", () => {
    const customizedPrice = getUnitPriceCents(575, {
      size: "Large",
      milk: "Oat",
      extraShot: true,
      notes: ""
    });

    expect(customizedPrice).toBe(875);
    const pricing = buildPricingSummary(1750, 600);
    expect(pricing.taxCents).toBe(105);
    expect(pricing.totalCents).toBe(1855);
  });

  it("formats customization descriptions", () => {
    const description = describeCustomization({
      size: "Large",
      milk: "Almond",
      extraShot: true,
      notes: "easy ice"
    });

    expect(description).toContain("Large");
    expect(description).toContain("Almond milk");
    expect(description).toContain("extra shot");
    expect(description).toContain("easy ice");
  });
});
