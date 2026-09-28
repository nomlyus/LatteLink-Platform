import { describe, expect, it } from "vitest";
import { filterMenuItems, getModifierGroupUsage, getPageRange, getUniqueMenuItems } from "../src/menu-page-model";

const latte = {
  itemId: "latte",
  categoryId: "drinks",
  categoryTitle: "Drinks",
  categoryIds: ["drinks", "featured-drinks"],
  name: "Latte",
  description: "Oat milk espresso",
  imageUrl: undefined,
  priceCents: 650,
  badgeCodes: ["popular"],
  visible: true,
  available: true,
  featured: true,
  modifierGroupAssignments: [{ modifierGroupId: "milk", sortOrder: 0 }],
  customizationGroups: [],
  sortOrder: 0
} as const;

const croissant = {
  ...latte,
  itemId: "croissant",
  categoryId: "pastries",
  categoryTitle: "Pastries",
  categoryIds: ["pastries"],
  name: "Croissant",
  description: "Butter pastry",
  badgeCodes: [],
  visible: false,
  available: false,
  featured: false,
  modifierGroupAssignments: [],
  sortOrder: 1
} as const;

const categories = [
  { categoryId: "drinks", title: "Drinks", items: [latte] },
  { categoryId: "featured-drinks", title: "Featured Drinks", items: [latte] },
  { categoryId: "pastries", title: "Pastries", items: [croissant] }
] as never;

describe("menu page model", () => {
  it("deduplicates an item displayed in multiple category memberships", () => {
    const items = getUniqueMenuItems(categories);
    expect(items.map((entry) => entry.itemId)).toEqual(["latte", "croissant"]);
    expect(items[0]?.categoryIds).toEqual(["drinks", "featured-drinks"]);
  });

  it("searches useful item, category, badge, and modifier names while filtering separate states", () => {
    const items = getUniqueMenuItems(categories);
    const groups = [{ id: "milk", label: "Milk choice" }];
    const base = { search: "", categoryId: "all", availability: "all" as const, visibility: "all" as const };
    expect(filterMenuItems(items, categories, groups, { ...base, search: "popular" }).map((entry) => entry.itemId)).toEqual(["latte"]);
    expect(filterMenuItems(items, categories, groups, { ...base, search: "milk choice" }).map((entry) => entry.itemId)).toEqual(["latte"]);
    expect(filterMenuItems(items, categories, groups, { ...base, categoryId: "featured-drinks" }).map((entry) => entry.itemId)).toEqual(["latte"]);
    expect(filterMenuItems(items, categories, groups, { ...base, availability: "sold-out", visibility: "hidden" }).map((entry) => entry.itemId)).toEqual(["croissant"]);
  });

  it("counts group usage by unique item rather than duplicated category presentation", () => {
    const usage = getModifierGroupUsage(categories);
    expect(usage.get("milk")?.map((entry) => entry.itemId)).toEqual(["latte"]);
  });

  it("calculates display ranges for paginated lists", () => {
    expect(getPageRange(1, 25, 57)).toEqual({ start: 1, end: 25 });
    expect(getPageRange(3, 25, 57)).toEqual({ start: 51, end: 57 });
    expect(getPageRange(1, 25, 0)).toEqual({ start: 0, end: 0 });
  });
});
