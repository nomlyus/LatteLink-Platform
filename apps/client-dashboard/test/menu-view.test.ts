import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { state } from "../src/state";

let renderMenuSection: typeof import("../src/views/menu").renderMenuSection;

const appConfig = {
  storeCapabilities: {
    menu: { source: "platform_managed" },
    operations: { fulfillmentMode: "staff", liveOrderTrackingEnabled: true, dashboardEnabled: true },
    loyalty: { visible: true }
  }
} as never;

const menuItem = (itemId: string, name: string, visible = true, imageUrl?: string) => ({
  itemId,
  categoryId: "drinks",
  categoryTitle: "Drinks",
  name,
  description: `${name} description`,
  priceCents: 650,
  visible,
  imageUrl,
  sortOrder: 0,
  customizationGroups: []
});

function setMenu(items = [menuItem("latte", "Latte"), menuItem("mocha", "Mocha", false)]) {
  state.session = {
    operator: {
      role: "manager",
      capabilities: ["menu:read", "menu:write", "menu:visibility"]
    }
  } as never;
  state.selectedLocationId = "loc_a";
  state.appConfig = appConfig;
  state.menuCategories = [{ categoryId: "drinks", title: "Drinks", items }] as never;
}

afterEach(() => {
  state.session = null;
  state.selectedLocationId = null;
  state.appConfig = null;
  state.menuCategories = [];
  state.menuCustomizationDrafts = {};
  state.menuItemsPage = 1;
  state.selectedMenuItemId = null;
  state.menuItemDetailsOpen = false;
  state.menuItemDetailsOpening = false;
  state.menuItemDetailsClosing = false;
});

beforeAll(async () => {
  vi.stubGlobal("document", { querySelector: () => ({}) });
  ({ renderMenuSection } = await import("../src/views/menu"));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("operator menu view", () => {
  it("renders menu items as rows and keeps item actions out of the table", () => {
    setMenu([
      menuItem("latte", "Latte", true, "https://images.example/latte.jpg"),
      menuItem("mocha", "Mocha", false)
    ]);

    const html = renderMenuSection();

    expect(html).toContain('<table class="dash-order-table dash-order-table--menu">');
    expect(html).toContain("<th scope=\"col\">Item</th>");
    expect(html.match(/class="dash-order-table__row/g)).toHaveLength(2);
    expect(html).toContain("Latte");
    expect(html).toContain("Mocha");
    expect(html).toContain("Drinks");
    expect(html).toContain("$6.50");
    expect(html).toContain('class="dash-menu-table__image" data-item-id="latte" src="https://images.example/latte.jpg"');
    expect(html).toContain("dash-menu-table__image--empty");
    expect(html).not.toContain("Menu management");
    expect(html).not.toContain("2 menu items");
    expect(html).toContain('aria-label="Add menu item" title="Add menu item"');
    expect(html).toContain('aria-label="View menu item details for Latte"');
    expect(html).not.toContain('data-form="menu-item"');
    expect(html).not.toContain('data-action="delete-menu-item"');
  });

  it("puts item editing, visibility, image, and customization controls in the details modal", () => {
    setMenu();
    state.selectedMenuItemId = "latte";
    state.menuItemDetailsOpen = true;

    const html = renderMenuSection();

    expect(html).toContain('role="dialog" aria-modal="true" aria-labelledby="menu-item-detail-title"');
    expect(html).toContain('id="menu-item-detail-title">Latte</h3>');
    expect(html).toContain('data-form="menu-item" data-item-id="latte"');
    expect(html).toContain('name="priceCents"');
    expect(html).toContain('data-action="toggle-menu-visibility"');
    expect(html).toContain('name="imageFile"');
    expect(html).toContain('data-action="add-customization-group"');
    expect(html).toContain('data-action="delete-menu-item"');
    expect(html).toContain('data-action="close-menu-item-details"');
  });

  it("paginates menu items by 10 rows", () => {
    const items = Array.from({ length: 11 }, (_, index) => menuItem(`item-${index + 1}`, `Item ${index + 1}`));
    setMenu(items);

    const firstPage = renderMenuSection();
    expect(firstPage.match(/class="dash-order-table__row/g)).toHaveLength(10);
    expect(firstPage).toContain("1 / 2");

    state.menuItemsPage = 2;
    const secondPage = renderMenuSection();
    expect(secondPage.match(/class="dash-order-table__row/g)).toHaveLength(1);
    expect(secondPage).toContain("Item 11");
    expect(secondPage).not.toContain("Item 1</strong>");
  });
});
