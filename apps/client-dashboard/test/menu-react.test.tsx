import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OperatorMenuCategory, OperatorMenuItem, OperatorMenuResponse, OperatorModifierGroup } from "../src/model";

const mockContext = vi.hoisted(() => ({
  session: {
    status: "authenticated",
    session: { operator: { operatorUserId: "operator-1", role: "owner", capabilities: ["menu:read", "menu:write", "menu:visibility"] } }
  },
  location: {
    selectedLocationId: "location-a",
    selectedLocation: { locationId: "location-a", appConfig: { storeCapabilities: { menu: { source: "platform_managed" }, operations: { fulfillmentMode: "staff", liveOrderTrackingEnabled: true, dashboardEnabled: true }, loyalty: { visible: true } } } }
  }
}));

vi.mock("../src/features/auth/session-provider", () => ({ useDashboardSession: () => mockContext.session }));
vi.mock("../src/features/location/location-provider", () => ({ useDashboardLocation: () => mockContext.location }));

import { MenuPage } from "../src/features/menu/components/MenuPage";
import { MenuItemEditor } from "../src/features/menu/components/MenuItemEditor";
import { MenuCategoryEditor } from "../src/features/menu/components/MenuCategoryEditor";
import { ModifierGroupEditor } from "../src/features/menu/components/ModifierGroupEditor";
import { MenuItemsPanel } from "../src/features/menu/components/MenuItemsPanel";
import { MenuCategoriesPanel } from "../src/features/menu/components/MenuCategoriesPanel";
import { ModifierGroupsPanel } from "../src/features/menu/components/ModifierGroupsPanel";
import type { useMenuMutations } from "../src/features/menu/use-menu-mutations";
import { buildItemModifierGroupAssignments, buildModifierGroupPayload, getMenuApiErrorMessage } from "../src/features/menu/menu-domain";

function fixture() {
  const group = {
    id: "milk-group",
    sourceGroupId: "source-milk",
    label: "Milk",
    description: "Choose a milk",
    selectionType: "single",
    required: true,
    minSelections: 1,
    maxSelections: 1,
    sortOrder: 0,
    displayStyle: "chips",
    options: [{ id: "oat", label: "Oat", description: "", priceDeltaCents: -25, default: true, available: true, sortOrder: 0, displayStyle: "emphasis" }]
  } as unknown as OperatorModifierGroup;
  const item = {
    itemId: "latte",
    categoryId: "drinks",
    categoryTitle: "Drinks",
    categoryIds: ["drinks"],
    name: "Latte",
    description: "Espresso with milk",
    imageUrl: "https://cdn.example.test/latte.jpg",
    priceCents: 650,
    badgeCodes: ["popular"],
    visible: true,
    available: false,
    featured: true,
    modifierGroupAssignments: [{ modifierGroupId: "milk-group", sortOrder: 0, requiredOverride: null, minSelectionsOverride: null, maxSelectionsOverride: null }],
    customizationGroups: [],
    sortOrder: 0
  } as unknown as OperatorMenuItem;
  const category = {
    categoryId: "drinks",
    title: "Drinks",
    description: "Coffee and tea",
    visible: true,
    sortOrder: 0,
    items: [item]
  } as unknown as OperatorMenuCategory;
  const menu = { locationId: "location-a", categories: [category], modifierGroups: [group] } as unknown as OperatorMenuResponse;
  return { group, item, category, menu };
}

const noop = () => undefined;
const mutationStub = {
  pendingOperation: null,
  pendingItemId: null,
  isMutating: false,
  error: null,
  notice: null,
  clearMessages: noop,
  reportError: noop,
  createItem: vi.fn(),
  saveItem: vi.fn(),
  setItemVisibility: vi.fn(),
  deleteItem: vi.fn(),
  createCategory: vi.fn(),
  saveCategory: vi.fn(),
  deleteCategory: vi.fn(),
  reorderCategories: vi.fn(),
  reorderCategoryItem: vi.fn(),
  createModifierGroup: vi.fn(),
  saveModifierGroup: vi.fn(),
  deleteModifierGroup: vi.fn()
} as unknown as ReturnType<typeof useMenuMutations>;

beforeEach(() => {
  mockContext.session.status = "authenticated";
  mockContext.session.session.operator.capabilities = ["menu:read", "menu:write", "menu:visibility"];
});

describe("React Menu presentation", () => {
  it("makes Items the default tab and renders the independent item filters and states", () => {
    const { menu } = fixture();
    const html = renderToStaticMarkup(<MenuPage menu={menu} loadStatus="ready" loadError={null} selectedLocationId="location-a" scopeKey="owner:location-a" externalSync={false} mutations={mutationStub} onRetry={noop} />);
    expect(html).toContain('id="menu-tab-items" type="button" role="tab" aria-selected="true"');
    expect(html).toContain("Search items");
    expect(html).toContain('aria-label="Filter by category"');
    expect(html).toContain('aria-label="Filter by availability"');
    expect(html).toContain('aria-label="Filter by visibility"');
    expect(html).toContain("Latte");
    expect(html).toContain("Featured");
    expect(html).toContain("Sold out");
    expect(html).toContain("Visible");
    expect(html).toContain("$6.50");
  });

  it("communicates external-sync read-only status and does not offer mutation controls", () => {
    mockContext.session.session.operator.capabilities = ["menu:read"];
    const { menu } = fixture();
    const html = renderToStaticMarkup(<MenuPage menu={menu} loadStatus="ready" loadError={null} selectedLocationId="location-a" scopeKey="owner:location-a" externalSync mutations={mutationStub} onRetry={noop} />);
    expect(html).toContain("Managed by connected source");
    expect(html).not.toContain(">Add item</button>");
    expect(html).not.toContain(">Add category</button>");
    expect(html).not.toContain(">Add modifier group</button>");
  });

  it("renders category membership counts and safe deletion copy", () => {
    const { category, menu } = fixture();
    const html = renderToStaticMarkup(<>
      <MenuCategoriesPanel categories={menu.categories} canWrite pending={false} onCreate={noop} onOpen={noop} onReorder={noop} onDelete={noop} />
      <MenuCategoryEditor category={category} categories={menu.categories} canWrite={false} pending={false} onClose={noop} onCreate={async () => null} onSave={async () => null} onDelete={noop} onReorderItem={noop} />
    </>);
    expect(html).toContain("Drinks");
    expect(html).toContain("1 item");
    expect(html).toContain("Removing a category membership keeps the item itself.");
    expect(html).toContain("Deleting this category removes its memberships, not the underlying items.");
  });

  it("shows reusable modifier-group usage and selection behavior", () => {
    const { group, menu } = fixture();
    const html = renderToStaticMarkup(<>
      <ModifierGroupsPanel groups={menu.modifierGroups} categories={menu.categories} query="" canWrite onQueryChange={noop} onCreate={noop} onOpen={noop} />
      <ModifierGroupEditor group={group} canWrite={false} pending={false} usedBy={menu.categories[0]?.items ?? []} onClose={noop} onSave={async () => null} onDelete={noop} onOpenItem={noop} />
    </>);
    expect(html).toContain("1 item · Single selection · Required");
    expect(html).toContain("Minimum selections");
    expect(html).toContain("Maximum selections");
    expect(html).toContain("Used by");
    expect(html).toContain("Latte");
    expect(html).toContain("-0.25");
    expect(html).toContain("Default");
    expect(html).toContain("Available");
  });

  it("exposes item metadata, category membership, reusable assignment, and read-only fields", () => {
    const { item, menu } = fixture();
    const html = renderToStaticMarkup(<MenuItemEditor item={item} categories={menu.categories} groups={menu.modifierGroups} canWrite={false} canToggleVisibility pending={false} onClose={noop} onSave={async () => null} onVisibilityChange={noop} onDelete={noop} onCreateModifierGroup={async () => null} />);
    expect(html).toContain("Description");
    expect(html).toContain("Base price");
    expect(html).toContain("Available to order");
    expect(html).toContain("Visible in customer menu");
    expect(html).toContain("Featured on the customer menu");
    expect(html).toContain("Primary category");
    expect(html).toContain("Milk");
    expect(html).toContain("Visibility can be changed separately.");
    expect(html).not.toContain("Save changes");
  });

  it("preserves modifier constraints, IDs, metadata, and negative option deltas on a round trip", () => {
    const { group } = fixture();
    const payload = buildModifierGroupPayload({
      label: group.label,
      description: group.description,
      selectionType: "single",
      required: true,
      minSelections: "1",
      maxSelections: "1",
      options: [{ id: "oat", label: "Oat", description: "", priceDelta: "-0.25", default: true, available: true, displayStyle: "emphasis" }]
    }, group, 8, () => "new-id");
    expect(payload).toMatchObject({ id: "milk-group", sourceGroupId: "source-milk", displayStyle: "chips", minSelections: 1, maxSelections: 1 });
    expect(payload.options[0]).toMatchObject({ id: "oat", displayStyle: "emphasis", priceDeltaCents: -25 });
  });

  it("preserves item-assignment overrides when assignments are reordered or unrelated fields are edited", () => {
    const assignments = buildItemModifierGroupAssignments([
      { modifierGroupId: "milk-group", sortOrder: 4, requiredOverride: false, minSelectionsOverride: 0, maxSelectionsOverride: 1 }
    ], ["milk-group"]);
    expect(assignments).toEqual([{ modifierGroupId: "milk-group", sortOrder: 0, requiredOverride: false, minSelectionsOverride: 0, maxSelectionsOverride: 1 }]);
  });

  it("explains a modifier-group-in-use conflict in operator language", () => {
    expect(getMenuApiErrorMessage({ payload: { code: "MODIFIER_GROUP_IN_USE" } }, "Fallback"))
      .toBe("This modifier group is assigned to one or more items. Remove those assignments before deleting the group.");
  });

  it("uses explicit empty and page-range states for items", () => {
    const { menu } = fixture();
    const emptyHtml = renderToStaticMarkup(<MenuItemsPanel items={[]} categories={menu.categories} modifierGroups={menu.modifierGroups} query="nothing" categoryFilter="all" availabilityFilter="all" visibilityFilter="all" page={1} loading={false} canWrite={false} canToggleVisibility={false} pendingItemId={null} onQueryChange={noop} onCategoryFilterChange={noop} onAvailabilityFilterChange={noop} onVisibilityFilterChange={noop} onPageChange={noop} onAddItem={noop} onEdit={noop} onAvailabilityChange={noop} onVisibilityChange={noop} onDelete={noop} />);
    expect(emptyHtml).toContain("No items match these filters");
  });
});
