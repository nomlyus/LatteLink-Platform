import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { HistoryRow } from "../src/orders/OrdersHistoryPrimitives";
import type { OrderHistoryEntry } from "../src/account/data";

vi.stubGlobal("React", React);
vi.mock("react-native", () => ({
  View: "View", Text: "Text", Pressable: "Pressable", Platform: { OS: "ios" },
  StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock("expo-blur", () => ({ BlurView: "BlurView" }));
vi.mock("expo-glass-effect", () => ({ GlassView: "GlassView" }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
vi.mock("expo-symbols", () => ({ SymbolView: "Symbol" }));
vi.mock("../src/ui/glass", () => ({ canUseLiquidGlass: () => true }));
vi.mock("../src/ui/NativeGlassSurface", () => ({ NativeGlassSurface: "NativeGlassSurface" }));
vi.mock("../src/ui/system", () => ({ uiPalette: {}, uiTypography: {} }));
vi.mock("../src/components", () => ({ OrderStatusPill: "Status", OrderItemThumbnail: "Thumbnail" }));
vi.mock("../src/menu/catalog", () => ({ formatUsd: (cents: number) => `$${(cents / 100).toFixed(2)}` }));

const order: OrderHistoryEntry = {
  id: "123e4567-e89b-12d3-a456-426614174000", status: "COMPLETED", pickupCode: "ABC123",
  items: [], total: { currency: "USD", amountCents: 650 },
  timeline: [{ status: "COMPLETED", occurredAt: "2026-10-26T12:00:00Z" }]
};

describe("History row alignment", () => {
  it("top-aligns status beside the image and baseline-aligns price beside the item summary", () => {
    const row = HistoryRow({ order, menuItemsById: new Map(), onPress: vi.fn() });
    const [imageRow, copy] = row.props.children;
    expect(imageRow.props.style).toMatchObject({ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" });
    expect(imageRow.props.children[1].type).toBe("Status");
    expect(imageRow.props.children[1].props.status).toBe("COMPLETED");
    const titleRow = copy.props.children[0];
    expect(titleRow.props.style.alignItems).toBe("baseline");
    expect(titleRow.props.children[1].props.children).toBe("$6.50");
    expect(titleRow.props.children[1].props.style.flexShrink).toBe(0);
    expect(copy.props.style[1].maxWidth).toBe("100%");
  });

  it("preserves canceled status and details interaction", () => {
    const openDetails = vi.fn();
    const row = HistoryRow({ order: { ...order, status: "CANCELED" }, menuItemsById: new Map(), onPress: openDetails });
    expect(row.props.children[0].props.children[1].props.status).toBe("CANCELED");
    row.props.onPress();
    expect(openDetails).toHaveBeenCalledOnce();
  });
});
