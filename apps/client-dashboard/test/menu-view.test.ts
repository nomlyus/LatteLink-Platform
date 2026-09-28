import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { state } from "../src/state";

let renderMenuSection: typeof import("../src/views/menu").renderMenuSection;

const platformManagedConfig = {
  storeCapabilities: {
    menu: { source: "platform_managed" },
    operations: { fulfillmentMode: "staff", liveOrderTrackingEnabled: true, dashboardEnabled: true },
    loyalty: { visible: true }
  }
} as never;

const milkGroup = {
  id: "milk-group",
  sourceGroupId: "ext-milk",
  label: "Milk",
  description: "Choose a milk",
  selectionType: "single",
  required: true,
  minSelections: 1,
  maxSelections: 1,
  sortOrder: 0,
  displayStyle: "chips",
  options: [
    { id: "whole", label: "Whole", description: "", priceDeltaCents: 0, default: true, available: true, sortOrder: 0, displayStyle: "default" },
    { id: "oat", label: "Oat", description: "", priceDeltaCents: 75, default: false, available: true, sortOrder: 1, displayStyle: "emphasis" }
  ]
} as const;

const item = (itemId: string, name: string, overrides: Record<string, unknown> = {}) => ({
  itemId,
  categoryId: "drinks",
  categoryTitle: "Drinks",
  categoryIds: ["drinks"],
  name,
  description: `${name} description`,
  priceCents: 650,
  badgeCodes: [],
  visible: true,
  available: true,
  featured: false,
  modifierGroupAssignments: [],
  customizationGroups: [],
  sortOrder: 0,
  ...overrides
});

function setMenu(items = [item("latte", "Latte"), item("mocha", "Mocha", { visible: false, available: false })]) {
  state.session = {
    operator: {
      role: "manager",
      capabilities: ["menu:read", "menu:write", "menu:visibility"]
    }
  } as never;
  state.selectedLocationId = "loc_a";
  state.appConfig = platformManagedConfig;
  state.menuActiveTab = "items";
  state.menuSearch = "";
  state.menuCategoryFilter = "all";
  state.menuAvailabilityFilter = "all";
  state.menuVisibilityFilter = "all";
  state.menuModifierGroupSearch = "";
  state.menuCategoryItemSearch = "";
  state.menuDialogKind = null;
  state.menuDialogEntityId = null;
  state.menuLoadError = null;
  state.menuItemsPage = 1;
  state.menuModifierGroups = [milkGroup] as never;
  state.menuCategories = [{
    categoryId: "drinks",
    title: "Drinks",
    description: "Coffee and tea",
    visible: true,
    sortOrder: 0,
    items
  }] as never;
}

afterEach(() => {
  state.session = null;
  state.selectedLocationId = null;
  state.appConfig = null;
  state.menuCategories = [];
  state.menuModifierGroups = [];
  state.menuCustomizationDrafts = {};
  state.menuItemsPage = 1;
  state.menuActiveTab = "items";
  state.menuSearch = "";
  state.menuCategoryFilter = "all";
  state.menuAvailabilityFilter = "all";
  state.menuVisibilityFilter = "all";
  state.menuModifierGroupSearch = "";
  state.menuCategoryItemSearch = "";
  state.menuDialogKind = null;
  state.menuDialogEntityId = null;
  state.menuLoadError = null;
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
  it("defaults to Items and renders the compact relational catalog table", () => {
    setMenu([
      item("latte", "Latte", { imageUrl: "https://images.example/latte.jpg", featured: true, badgeCodes: ["popular"], modifierGroupAssignments: [{ modifierGroupId: "milk-group", sortOrder: 0 }] }),
      item("mocha", "Mocha", { visible: false, available: false })
    ]);

    const html = renderMenuSection();

    expect(html).toContain('role="tab" aria-selected="true" aria-controls="menu-panel-items"');
    expect(html).toContain("Items</button>");
    expect(html).toContain("Categories</button>");
    expect(html).toContain("Modifier Groups</button>");
    expect(html).toContain('placeholder="Search items…"');
    expect(html).toContain("All categories");
    expect(html).toContain("All availability");
    expect(html).toContain("All visibility");
    expect(html).toContain('<th scope="col">Item</th>');
    expect(html).toContain('<th scope="col">Category</th>');
    expect(html).toContain('<th scope="col" class="dash-order-table__amount-heading">Price</th>');
    expect(html).toContain("Availability</th>");
    expect(html).toContain("Visibility</th>");
    expect(html.match(/data-menu-item-row=/g)).toHaveLength(2);
    expect(html).toContain("Featured");
    expect(html).toContain("Available");
    expect(html).toContain("Sold out");
    expect(html).toContain("Visible");
    expect(html).toContain("Hidden");
    expect(html).toContain("$6.50");
    expect(html).toContain("Milk");
    expect(html).not.toContain("DETAILS");
    expect(html).not.toContain("customization_groups_json");
    expect(html).not.toContain("data-action=\"open-menu-item-details\"");
  });

  it("filters items by search metadata, category membership, availability, and visibility", () => {
    const latte = item("latte", "Latte", { badgeCodes: ["popular"], modifierGroupAssignments: [{ modifierGroupId: "milk-group", sortOrder: 0 }] });
    const pastry = item("croissant", "Butter Croissant", { categoryId: "pastries", categoryTitle: "Pastries", categoryIds: ["pastries"], visible: false, available: false });
    setMenu([latte, pastry]);
    state.menuCategories = [
      { categoryId: "drinks", title: "Drinks", description: "", visible: true, sortOrder: 0, items: [latte] },
      { categoryId: "pastries", title: "Pastries", description: "", visible: true, sortOrder: 1, items: [pastry] }
    ] as never;
    state.menuSearch = "popular";
    expect((renderMenuSection().match(/data-menu-item-row=/g) ?? [])).toHaveLength(1);

    state.menuSearch = "";
    state.menuCategoryFilter = "pastries";
    state.menuAvailabilityFilter = "sold-out";
    state.menuVisibilityFilter = "hidden";
    const filtered = renderMenuSection();
    expect(filtered).toContain("Butter Croissant");
    expect(filtered).not.toContain(">Latte</strong>");
  });

  it("opens a substantial item editor with separate availability, visibility, memberships, and reusable assignments", () => {
    setMenu([item("latte", "Latte", {
      imageUrl: "https://images.example/latte.jpg",
      featured: true,
      categoryIds: ["drinks", "seasonal"],
      modifierGroupAssignments: [{ modifierGroupId: "milk-group", sortOrder: 0 }]
    })]);
    state.menuCategories.push({ categoryId: "seasonal", title: "Seasonal", description: "", visible: true, sortOrder: 1, items: [] } as never);
    state.menuDialogKind = "item";
    state.menuDialogEntityId = "latte";

    const html = renderMenuSection();

    expect(html).toContain('role="dialog" aria-modal="true" aria-labelledby="menu-item-editor-title"');
    expect(html).toContain('data-form="menu-item" data-item-id="latte"');
    expect(html).toContain('name="description"');
    expect(html).toContain('name="price"');
    expect(html).toContain('name="available"');
    expect(html).toContain('name="visible"');
    expect(html).toContain('name="featured"');
    expect(html).toContain('name="badgeCodes"');
    expect(html).toContain('name="categoryIds" value="seasonal" checked');
    expect(html).toContain('name="primaryCategoryId"');
    expect(html).toContain('<option value="drinks" selected>Drinks</option>');
    expect(html).toContain('name="modifierGroupId" value="milk-group"');
    expect(html).toContain("Add existing modifier group");
    expect(html).toContain("Create new modifier group");
    expect(html).toContain('data-action="close-menu-dialog"');
  });

  it("uses 25 rows per page and shows a compact accessible range", () => {
    setMenu(Array.from({ length: 27 }, (_, index) => item(`item-${index + 1}`, `Item ${index + 1}`, { sortOrder: index })));
    const firstPage = renderMenuSection();
    expect(firstPage.match(/data-menu-item-row=/g)).toHaveLength(25);
    expect(firstPage).toContain("1–25 of 27");
    expect(firstPage).toContain('aria-label="Page 1"');

    state.menuItemsPage = 2;
    const secondPage = renderMenuSection();
    expect(secondPage.match(/data-menu-item-row=/g)).toHaveLength(2);
    expect(secondPage).toContain("26–27 of 27");
    expect(secondPage).toContain("Item 27");
  });

  it("renders deliberate empty, filtered, and API-error states", () => {
    setMenu([]);
    expect(renderMenuSection()).toContain("No items yet");

    state.menuSearch = "missing";
    expect(renderMenuSection()).toContain("No items match these filters");

    state.menuSearch = "";
    state.menuLoadError = "Unable to load this location’s menu. Try again.";
    expect(renderMenuSection()).toContain('role="alert"');
    expect(renderMenuSection()).toContain('data-action="retry-menu-load"');
  });

  it("shows categories with item counts and safe category-delete messaging", () => {
    const latte = item("latte", "Latte", { categoryIds: ["drinks", "seasonal"] });
    const pastry = item("croissant", "Croissant", { categoryId: "seasonal", categoryTitle: "Seasonal", categoryIds: ["seasonal"] });
    setMenu([latte]);
    state.menuCategories = [
      { categoryId: "drinks", title: "Drinks", description: "Coffee", visible: true, sortOrder: 0, items: [latte] },
      { categoryId: "seasonal", title: "Seasonal", description: "", visible: true, sortOrder: 1, items: [latte, pastry] }
    ] as never;
    state.menuActiveTab = "categories";
    const list = renderMenuSection();
    expect(list).toContain("2 items");
    expect(list).toContain('data-action="reorder-menu-category"');
    expect(list).toContain('data-action="open-menu-category"');

    state.menuDialogKind = "category";
    state.menuDialogEntityId = "seasonal";
    const editor = renderMenuSection();
    expect(editor).toContain('data-form="menu-category" data-category-id="seasonal"');
    expect(editor).toContain('name="categoryMemberItemIds"');
    expect(editor).toContain("Removing a category membership keeps the item itself.");
    expect(editor).toContain("Deleting this category removes the category and its memberships, not the items themselves.");
  });

  it("lists reusable modifier groups by assignment usage and preserves selection constraints and metadata", () => {
    const latte = item("latte", "Latte", { modifierGroupAssignments: [{ modifierGroupId: "milk-group", sortOrder: 0 }] });
    setMenu([latte]);
    state.menuActiveTab = "modifier-groups";
    const list = renderMenuSection();
    expect(list).toContain("Milk");
    expect(list).toContain("1 item · Single selection · Required");

    state.menuDialogKind = "modifier-group";
    state.menuDialogEntityId = "milk-group";
    const editor = renderMenuSection();
    expect(editor).toContain('name="selectionType"');
    expect(editor).toContain('value="single"');
    expect(editor).toContain('name="required"');
    expect(editor).toContain('name="minSelections"');
    expect(editor).toContain('name="maxSelections"');
    expect(editor).toContain('name="sourceGroupId" value="ext-milk"');
    expect(editor).toContain('name="displayStyle" value="chips"');
    expect(editor).toContain('name="optionDisplayStyle" value="emphasis"');
    expect(editor).toContain("Used by");
    expect(editor).toContain("Latte");
    expect(editor).toContain('type="number" step="0.01" inputmode="decimal" value="0.75"');
    expect(editor).not.toContain('min="0" step="0.01" inputmode="decimal"');
    expect(editor).not.toContain('value="multi"');
    expect(editor).not.toContain('value="boolean"');
  });

  it("exposes only visibility actions to a visibility-only operator", () => {
    setMenu([item("latte", "Latte")]);
    state.session = { operator: { role: "manager", capabilities: ["menu:read", "menu:visibility"] } } as never;
    const html = renderMenuSection();
    expect(html).toContain("Hide");
    expect(html).not.toContain("Mark sold out");
    expect(html).not.toContain("Delete item");
    state.menuDialogKind = "item";
    state.menuDialogEntityId = "latte";
    const editor = renderMenuSection();
    expect(editor).toContain("Visibility can be changed separately.");
    expect(editor).not.toContain("Save changes");
  });

  it("keeps external-sync menus readable but hides mutation controls", () => {
    setMenu([item("latte", "Latte")]);
    state.appConfig = {
      storeCapabilities: {
        menu: { source: "external_sync" },
        operations: { fulfillmentMode: "staff", liveOrderTrackingEnabled: true, dashboardEnabled: true },
        loyalty: { visible: true }
      }
    } as never;
    const html = renderMenuSection();
    expect(html).toContain("Managed by connected source");
    expect(html).toContain("Latte");
    expect(html).not.toContain('data-action="open-menu-create-item"');
    expect(html).not.toContain('data-action="delete-menu-item"');
    expect(html).not.toContain('data-action="open-menu-create-category"');
  });
});
