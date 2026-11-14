import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { menuCategorySchema } from "@lattelink/contracts-catalog";
import type { MenuCategory } from "../src/menu/catalog";
import { CatalogSearchResults } from "../src/search/CatalogSearchResults";

const runtime = vi.hoisted(() => ({ categories: [] as MenuCategory[], loading: false, error: false, push: vi.fn(), retry: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("react", async (original) => ({ ...await original<typeof React>(), useMemo: (factory: () => unknown) => factory(), useDeferredValue: (value: string) => value }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: runtime.push }) }));
vi.mock("expo-symbols", () => ({ SymbolView: "Symbol" }));
vi.mock("react-native", () => ({ FlatList: "List", View: "View", Pressable: "Pressable", Text: "Text", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("../src/ui/system", () => ({ uiPalette: {} }));
vi.mock("../src/ui/ScreenState", () => ({ ScreenState: "ScreenState" }));
vi.mock("../src/components/OrderItemThumbnail", () => ({ OrderItemThumbnail: "Thumbnail" }));
vi.mock("../src/navigation/nativeAppleHeader", () => ({ nativeAppleHeaderCapabilities: () => ({ available: true }) }));
vi.mock("../src/navigation/useNativeScrollEdge", () => ({ useNativeScrollEdge: () => vi.fn() }));
vi.mock("../src/menu/catalog", () => ({
  useMenuQuery: () => ({ data: { categories: runtime.categories }, isLoading: runtime.loading, isError: runtime.error, refetch: runtime.retry }),
  resolveMenuData: (data: unknown) => data, formatUsd: (value: number) => `$${(value / 100).toFixed(2)}`
}));

describe("Search results integration", () => {
  beforeEach(() => {
    runtime.categories = [menuCategorySchema.parse({ id: "coffee", title: "Coffee", items: [
      { id: "latte", name: "Latte", description: "Milk and espresso", priceCents: 500, visible: true }
    ] })];
    runtime.loading = false; runtime.error = false; vi.clearAllMocks();
  });
  it("opens the existing customization route using the actual menu item ID", () => {
    const list = CatalogSearchResults({ query: "latte" });
    expect(list.props.data[0].item).toBe(runtime.categories[0].items[0]);
    const row = list.props.renderItem({ item: list.props.data[0], index: 0, separators: { highlight: vi.fn(), unhighlight: vi.fn(), updateProps: vi.fn() } });
    if (!React.isValidElement<{ onPress: () => void }>(row)) throw new Error("Missing row");
    row.props.onPress();
    expect(runtime.push).toHaveBeenCalledWith({ pathname: "/menu-customize", params: { itemId: "latte" } });
  });
  it("disables unavailable items and never shows cached results after a failed reload", () => {
    runtime.categories[0].items[0].available = false;
    let list = CatalogSearchResults({ query: "latte" });
    const row = list.props.renderItem({ item: list.props.data[0], index: 0, separators: { highlight: vi.fn(), unhighlight: vi.fn(), updateProps: vi.fn() } });
    expect(React.isValidElement<{ disabled: boolean }>(row) && row.props.disabled).toBe(true);
    runtime.error = true;
    list = CatalogSearchResults({ query: "latte" });
    expect(list.props.data).toEqual([]);
    expect(list.props.ListEmptyComponent.props.title).toBe("Menu unavailable");
    list.props.ListEmptyComponent.props.onAction();
    expect(runtime.retry).toHaveBeenCalledOnce();
  });
  it("separates loading, initial, and no-result states and clears on location data changes", () => {
    expect(CatalogSearchResults({ query: "" }).props.ListEmptyComponent.props.title).toBe("Find your next favorite");
    runtime.loading = true;
    expect(CatalogSearchResults({ query: "latte" }).props.ListEmptyComponent.props.loading).toBe(true);
    runtime.loading = false; runtime.categories = [];
    const list = CatalogSearchResults({ query: "latte" });
    expect(list.props.data).toEqual([]);
    expect(list.props.ListEmptyComponent.props.title).toBe("No matches");
  });
});
