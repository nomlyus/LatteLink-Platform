import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderHistoryEntry } from "../src/account/data";
import { OrderArchiveRow } from "../src/orders/OrderArchiveRow";
import { OrderDetailScreen } from "../src/orders/OrderDetailScreen";
import { ScreenState } from "../src/ui/ScreenState";
import { OrdersSearchResults } from "../src/orders/OrdersSearchResults";

const runtime = vi.hoisted(() => ({ authenticated: true, error: null as Error | null, orders: [] as OrderHistoryEntry[], loading: false, refetch: vi.fn(), push: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("react", async (original) => ({ ...await original<typeof React>(), useMemo: (calculate: () => unknown) => calculate() }));
vi.mock("expo-router", () => ({ Stack: { Screen: "StackScreen" }, useRouter: () => ({ push: runtime.push }) }));
vi.mock("expo-router/react-navigation", () => ({ useHeaderHeight: () => 56 }));
vi.mock("react-native", () => ({ ScrollView: "ScrollView", View: "View", Text: "Text", Pressable: "Pressable", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 20 }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
vi.mock("expo-symbols", () => ({ SymbolView: "Symbol" }));
vi.mock("../src/orders/OrderProgress", () => ({ OrderProgress: "OrderProgress" }));
vi.mock("../src/ui/ScreenState", () => ({ ScreenState: "ScreenState" }));
vi.mock("../src/ui/system", () => ({ uiPalette: {}, Button: "Button" }));
vi.mock("../src/components/OrderItemThumbnail", () => ({ OrderItemThumbnail: "Thumbnail" }));
vi.mock("../src/auth/session", () => ({ useAuthSession: () => ({ isAuthenticated: runtime.authenticated }) }));
vi.mock("../src/account/data", () => ({
  useOrderHistoryQuery: () => ({ data: runtime.orders, error: runtime.error, isLoading: runtime.loading, refetch: runtime.refetch }),
  useLoyaltyLedgerQuery: () => ({ data: [] })
}));
vi.mock("../src/menu/catalog", () => ({
  useMenuQuery: () => ({ data: undefined }), resolveMenuData: () => undefined,
  useAppConfigQuery: () => ({ data: { brand: { brandName: "Test Coffee" } } }), resolveAppConfigData: (data: unknown) => data,
  formatUsd: (cents: number) => `$${(cents / 100).toFixed(2)}`
}));

const order: OrderHistoryEntry = { id: "order-id", status: "COMPLETED", pickupCode: "ABC123", items: [{ itemId: "latte", itemName: "Latte", quantity: 2, unitPriceCents: 500, lineTotalCents: 1200 }], total: { currency: "USD", amountCents: 1300 }, timeline: [{ status: "COMPLETED", occurredAt: "2026-10-15T12:00:00Z" }] };

function nodes(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...nodes(node.props.children as React.ReactNode)];
}
function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

describe("Orders sheet receipt", () => {
  beforeEach(() => { runtime.authenticated = true; runtime.error = null; runtime.orders = [order]; runtime.loading = false; });
  it("renders a compact horizontal archive row with the real status", () => {
    const open = vi.fn();
    const row = OrderArchiveRow({ order, menuItemsById: new Map(), onPress: open });
    expect(row.props.style).toMatchObject({ flexDirection: "row", alignItems: "center" });
    expect(text(row)).toContain("Latte Picked up");
    expect(text(row)).not.toContain("Test Coffee");
    expect(text(row)).toContain("$13.00");
    row.props.onPress();
    expect(open).toHaveBeenCalledOnce();
  });
  it("search results show item summaries and open the individual order inside the same sheet", () => {
    const results = OrdersSearchResults({ orders: [order] });
    const resultRow = nodes(results).find((node) => node.type === OrderArchiveRow);
    expect(resultRow?.props.order).toBe(order);
    (resultRow?.props.onPress as () => void)();
    expect(runtime.push).toHaveBeenCalledWith({ pathname: "/(tabs)/orders/detail", params: { orderId: order.id } });
    const summary = OrderArchiveRow({ order, menuItemsById: new Map(), onPress: vi.fn() });
    expect(text(summary)).toContain("Latte");
    expect(text(summary)).toContain("$13.00");
    expect(text(OrdersSearchResults({ orders: [] }))).toContain("No matching orders.");
  });
  it("shows authoritative prices and the native in-sheet header without a fake refund section", () => {
    const receipt = OrderDetailScreen({ orderId: order.id });
    const all = nodes(receipt);
    expect(text(receipt)).toContain("Picked up");
    expect(text(receipt)).toContain("$12.00");
    expect(all.find((node) => node.props.label === "Order total")?.props.value).toBe("$13.00");
    expect(all.find((node) => node.props.label === "Order ID")?.props.value).toBe(order.id);
    expect(text(receipt)).not.toContain("Refund");
    expect(all.find((node) => node.type === "StackScreen")?.props.options).toEqual({ title: "", headerLargeTitleEnabled: false });
  });
  it("shows confirmed refunds only when present", () => {
    runtime.orders = [{ ...order, refundSummary: { state: "PARTIAL", settledAmountCents: 400, remainingPaidAmountCents: 900, settledRefundCount: 1, allocationQuality: "COMPLETE", unverifiedRefundCount: 0 } }];
    expect(text(OrderDetailScreen({ orderId: order.id })).replace(/\s+/g, " ")).toContain("$4.00 refunded");
  });
  it("hides cached order data when signed out and provides the existing sign-in return", () => {
    runtime.authenticated = false;
    const receipt = OrderDetailScreen({ orderId: order.id });
    expect(text(receipt)).not.toContain("Picked up");
    const signIn = nodes(receipt).find((node) => node.type === ScreenState);
    expect(signIn?.props.title).toBe("Sign in to view this order.");
    (signIn?.props.onAction as () => void)();
    expect(runtime.push).toHaveBeenCalledWith({ pathname: "/auth", params: { returnTo: "/(tabs)/orders" } });
  });
  it("distinguishes failed loading from a missing order", () => {
    runtime.error = new Error("Offline");
    const receipt = OrderDetailScreen({ orderId: order.id });
    const retry = nodes(receipt).find((node) => node.type === ScreenState);
    expect(retry?.props.title).toBe("Unable to load order details.");
    expect(retry?.props.actionLabel).toBe("Retry");
    (retry?.props.onAction as () => void)();
    expect(runtime.refetch).toHaveBeenCalledOnce();
  });
});
