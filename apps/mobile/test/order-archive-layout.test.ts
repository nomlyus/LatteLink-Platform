import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderHistoryEntry } from "../src/account/data";
import { OrdersArchive } from "../src/orders/OrdersArchive";

const runtime = vi.hoisted(() => ({ push: vi.fn(), query: "" }));
vi.stubGlobal("React", React);
vi.mock("react", async (original) => ({
  ...await original<typeof React>(),
  useState: () => [runtime.query, (query: string) => { runtime.query = query; }],
  useMemo: (calculate: () => unknown) => calculate()
}));
vi.mock("expo-router", () => ({ Stack: { Screen: "StackScreen" }, useRouter: () => ({ push: runtime.push }) }));
vi.mock("react-native", () => ({ View: "View", Text: "Text", Pressable: "Pressable", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
vi.mock("expo-symbols", () => ({ SymbolView: "Symbol" }));
vi.mock("../src/ui/system", () => ({ uiPalette: {} }));
vi.mock("../src/orders/OrdersSearchResults", () => ({ OrdersSearchResults: "SearchResults" }));

const order: OrderHistoryEntry = { id: "order", status: "COMPLETED", pickupCode: "ABC123", items: [],
  total: { currency: "USD", amountCents: 650 }, timeline: [{ status: "COMPLETED", occurredAt: "2026-10-15T12:00:00Z" }] };

describe("Wallet-style order groups", () => {
  beforeEach(() => { runtime.query = ""; });
  it("shows individual matching orders while searching and restores month groups when cleared", () => {
    const search = OrdersArchive({ orders: [order] }).props.children[0].props.options.headerSearchBarOptions;
    search.onChangeText({ nativeEvent: { text: "ABC123" } });
    const results = OrdersArchive({ orders: [order] }).props.children[1];
    expect(results.type).toBe("SearchResults");
    expect(results.props.orders).toEqual([order]);
    search.onCancelButtonPress();
    expect(Array.isArray(OrdersArchive({ orders: [order] }).props.children[1])).toBe(true);
  });
  it("passes an empty result list when nothing matches, instead of month groups", () => {
    runtime.query = "not-found";
    const results = OrdersArchive({ orders: [order] }).props.children[1];
    expect(results.type).toBe("SearchResults");
    expect(results.props.orders).toEqual([]);
  });
  it("keeps the icon, month/count and chevron in one explicitly styled horizontal row", () => {
    const archive = OrdersArchive({ orders: [order] });
    const year = archive.props.children[1][0];
    const group = year.props.children[1];
    const row = group.props.children[0].props.children[1];
    expect(typeof row.props.style).toBe("object");
    expect(row.props.style).toMatchObject({ flexDirection: "row", alignItems: "center", minHeight: 82 });
    expect(row.props.children.map((child: React.ReactElement) => child.type)).toEqual(["View", "View", "Symbol"]);
    expect(row.props.children[2].props.name.ios).toBe("chevron.right");
    expect(row.props.children[0].props.children.props.name.ios).toBe("shippingbox");
    expect(row.props.children[1].props.children[0].props.children).toBe("October");
    row.props.onPress();
    expect(runtime.push).toHaveBeenCalledWith({ pathname: "/(tabs)/orders/month", params: { month: "2026-10" } });
  });
  it("uses native search with toolbar integration instead of a custom floating field", () => {
    const search = OrdersArchive({ orders: [order] }).props.children[0];
    expect(search.props.options.headerSearchBarOptions).toMatchObject({ placement: "automatic", allowToolbarIntegration: true });
  });
});
