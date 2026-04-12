import { describe, expect, it } from "vitest";
import { normalizeCustomizationGroups } from "@lattelink/contracts-catalog";
import {
  DEFAULT_CUSTOMIZATION,
  addCartItem,
  buildPricingSummary,
  createCartItem,
  describeCustomization,
  getUnitPriceCents
} from "../src/cart/model";

const espressoGroups = normalizeCustomizationGroups([
  {
    id: "size",
    label: "Size",
    selectionType: "single" as const,
    required: true,
    minSelections: 1,
    maxSelections: 1,
    sortOrder: 0,
    options: [
      { id: "regular", label: "Regular", priceDeltaCents: 0, default: true, sortOrder: 0, available: true },
      { id: "large", label: "Large", priceDeltaCents: 100, sortOrder: 1, available: true }
    ]
  },
  {
    id: "milk",
    label: "Milk",
    selectionType: "single" as const,
    required: true,
    minSelections: 1,
    maxSelections: 1,
    sortOrder: 1,
    options: [
      { id: "whole", label: "Whole milk", priceDeltaCents: 0, default: true, sortOrder: 0, available: true },
      { id: "oat", label: "Oat milk", priceDeltaCents: 75, sortOrder: 1, available: true }
    ]
  },
  {
    id: "extras",
    label: "Extras",
    selectionType: "multiple" as const,
    required: false,
    minSelections: 0,
    maxSelections: 2,
    sortOrder: 2,
    options: [
      { id: "extra-shot", label: "Extra shot", priceDeltaCents: 125, sortOrder: 0, available: true }
    ]
  }
]);

function createLatteInput(selectedOptions: Array<{ groupId: string; optionId: string }>, quantity?: number) {
  return {
    menuItemId: "latte",
    itemName: "Latte",
    basePriceCents: 575,
    customizationGroups: espressoGroups,
    customization: {
      ...DEFAULT_CUSTOMIZATION,
      selectedOptions
    },
    quantity
  };
}

describe("cart model", () => {
  it("merges line items with identical customization", () => {
    let items = addCartItem([], createLatteInput([{ groupId: "size", optionId: "large" }, { groupId: "milk", optionId: "whole" }]));

    items = addCartItem(
      items,
      createLatteInput(
        [
          { groupId: "size", optionId: "large" },
          { groupId: "milk", optionId: "whole" }
        ],
        2
      )
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(3);
    expect(items[0]?.lineTotalCents).toBe((items[0]?.unitPriceCents ?? 0) * 3);
  });

  it("creates separate lines for different customization", () => {
    let items = addCartItem([], createLatteInput([{ groupId: "size", optionId: "regular" }, { groupId: "milk", optionId: "whole" }]));

    items = addCartItem(
      items,
      createLatteInput([{ groupId: "size", optionId: "regular" }, { groupId: "milk", optionId: "oat" }])
    );

    expect(items).toHaveLength(2);
  });

  it("calculates pricing with multiple option deltas", () => {
    const customizedPrice = getUnitPriceCents(
      575,
      espressoGroups,
      {
        selectedOptions: [
          { groupId: "size", optionId: "large" },
          { groupId: "milk", optionId: "oat" },
          { groupId: "extras", optionId: "extra-shot" }
        ],
        notes: ""
      }
    );

    expect(customizedPrice).toBe(875);
    const pricing = buildPricingSummary(1750, 600);
    expect(pricing.taxCents).toBe(105);
    expect(pricing.totalCents).toBe(1855);
  });

  it("stores snapshot-safe customization labels on cart lines", () => {
    const item = createCartItem({
      ...createLatteInput([
        { groupId: "size", optionId: "large" },
        { groupId: "milk", optionId: "oat" },
        { groupId: "extras", optionId: "extra-shot" }
      ]),
      customization: {
        selectedOptions: [
          { groupId: "size", optionId: "large" },
          { groupId: "milk", optionId: "oat" },
          { groupId: "extras", optionId: "extra-shot" }
        ],
        notes: "easy ice"
      }
    });

    expect(item.customizationSelections[0]?.groupLabel).toBe("Size");
    expect(item.customizationSelections[1]?.selectedOptions[0]?.optionLabel).toBe("Oat milk");
    expect(describeCustomization(item)).toContain("Large");
    expect(describeCustomization(item)).toContain("Oat milk");
    expect(describeCustomization(item)).toContain("easy ice");
  });

  it("rejects invalid missing required group selections", () => {
    expect(() =>
      createCartItem({
        menuItemId: "latte",
        itemName: "Latte",
        basePriceCents: 575,
        customizationGroups: espressoGroups,
        customization: {
          ...DEFAULT_CUSTOMIZATION,
          selectedOptions: [{ groupId: "size", optionId: "regular" }]
        }
      })
    ).toThrow(/Invalid customization/);
  });

  it("supports items with no customization groups", () => {
    const item = createCartItem({
      menuItemId: "croissant",
      itemName: "Croissant",
      basePriceCents: 425,
      customizationGroups: [],
      customization: {
        selectedOptions: [],
        notes: "warm it up"
      }
    });

    expect(item.unitPriceCents).toBe(425);
    expect(item.lineTotalCents).toBe(425);
    expect(item.customizationSelections).toEqual([]);
    expect(describeCustomization(item)).toContain("warm it up");
  });
});
