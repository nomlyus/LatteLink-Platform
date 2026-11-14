import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveHistoryItemIcon } from "../src/orders/presentation";
import { OrderItemThumbnail } from "../src/components/OrderItemThumbnail";

vi.mock("react-native", () => ({
  View: "View",
  Image: "Image",
  StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
vi.mock("expo-symbols", () => ({ SymbolView: "Symbol" }));
vi.mock("../src/ui/system", () => ({
  uiPalette: { accent: "accent", surfaceMuted: "surfaceMuted" }
}));
vi.mock("../src/menu/useMenuImage", () => ({
  useMenuImage: () => ({ imageFailed: true })
}));

// Vitest's JSX transform is classic; Expo's production transform is automatic.
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

describe("order history fallback artwork", () => {
  it("renders native symbols for the Orders sheet thumbnail fallback", () => {
    expect(OrderItemThumbnail({ label: "Order", fallbackSymbol: { ios: "bag", android: "shopping_bag" } })).toMatchObject({
      props: { children: { type: "Symbol", props: { name: { ios: "bag", android: "shopping_bag" } } } }
    });
  });
  it.each([
    ["Cortado", "sparkles-outline"],
    ["Cortado coffee", "cafe-outline"],
    ["Matcha latte", "leaf-outline"],
    ["Coffee muffin", "nutrition-outline"],
    ["Espresso", "cafe-outline"]
  ])("preserves the original fallback for %s", (name, icon) => {
    expect(resolveHistoryItemIcon(name)).toBe(icon);
  });

  it("keeps receipt artwork unchanged while allowing history's original fallback", () => {
    expect(OrderItemThumbnail({ label: "Cortado" })).toMatchObject({
      props: { children: { props: { name: "cafe-outline" } } }
    });
    expect(
      OrderItemThumbnail({
        label: "Cortado",
        size: "small",
        fallbackIcon: resolveHistoryItemIcon("Cortado")
      })
    ).toMatchObject({
      props: { children: { props: { name: "sparkles-outline" } } }
    });
  });
});
