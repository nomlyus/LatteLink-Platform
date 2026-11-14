import { describe, expect, it } from "vitest";
import { menuCategorySchema } from "@lattelink/contracts-catalog";
import { searchCatalog } from "../src/search/catalogSearch";

const coffee = menuCategorySchema.parse({ id: "coffee", title: "Coffee", items: [
  { id: "latte", name: "Iced Latte", description: "Espresso and milk", priceCents: 500, visible: true },
  { id: "sold-out", name: "Cortado", description: "Milk", priceCents: 400, visible: true, available: false },
  { id: "hidden", name: "Secret latte", description: "Milk", priceCents: 100, visible: false }
] });
describe("catalog search", () => {
  it("starts empty and matches case-insensitive words across name, description, and category", () => {
    expect(searchCatalog([coffee], "  ")).toEqual([]);
    expect(searchCatalog([coffee], " ICED milk coffee ").map(({ item }) => item.id)).toEqual(["latte"]);
    expect(searchCatalog([coffee], "no match")).toEqual([]);
  });
  it("retains the real product object and its availability while excluding hidden content", () => {
    const result = searchCatalog([coffee], "cortado")[0];
    expect(result.item).toBe(coffee.items[1]);
    expect(result.item.available).toBe(false);
    expect(searchCatalog([coffee], "secret")).toEqual([]);
    expect(searchCatalog([{ ...coffee, visible: false }], "latte")).toEqual([]);
  });
  it("doesn't duplicate a product listed in more than one category or cross input location data", () => {
    expect(searchCatalog([coffee, coffee], "latte")).toHaveLength(1);
    expect(searchCatalog([], "latte")).toEqual([]);
  });
});
