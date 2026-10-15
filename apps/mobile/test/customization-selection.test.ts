import { describe, expect, it } from "vitest";
import { normalizeCustomizationGroups } from "@lattelink/contracts-catalog";
import { updateCustomizationOption } from "../src/menu/customizationSelection";
import { normalizeCustomization } from "../src/cart/model";

const options = ["a", "b", "c"].map((id, sortOrder) => ({
  id,
  label: id,
  priceDeltaCents: 0,
  sortOrder,
  available: true
}));
const group = normalizeCustomizationGroups([
  {
    id: "extras",
    label: "Extras",
    selectionType: "multiple",
    required: false,
    minSelections: 0,
    maxSelections: 2,
    sortOrder: 0,
    options
  }
])[0];
const initial = normalizeCustomization({ selectedOptions: [{ groupId: "milk", optionId: "oat" }], notes: "less ice" });

describe("customization selection", () => {
  it("preserves other groups and notes while enforcing limits and toggling extras", () => {
    const first = updateCustomizationOption(initial, group, group.options[0]);
    const full = updateCustomizationOption(first, group, group.options[1]);
    expect(updateCustomizationOption(full, group, group.options[2])).toBe(full);
    const removed = updateCustomizationOption(full, group, group.options[0]);
    expect(removed.selectedOptions).toEqual([
      { groupId: "extras", optionId: "b" },
      { groupId: "milk", optionId: "oat" }
    ]);
    expect(removed.notes).toBe("less ice");
  });
  it("replaces a single choice while retaining unrelated selections", () => {
    const single = { ...group, selectionType: "single" as const, maxSelections: 1 };
    const first = updateCustomizationOption(initial, single, group.options[0]);
    const next = updateCustomizationOption(first, single, group.options[1]);
    expect(next.selectedOptions).toContainEqual({ groupId: "milk", optionId: "oat" });
    expect(next.selectedOptions.filter((entry) => entry.groupId === group.id)).toEqual([
      { groupId: group.id, optionId: "b" }
    ]);
  });
});
