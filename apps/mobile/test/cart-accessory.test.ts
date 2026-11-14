import * as React from "react";
import { uiPalette } from "../src/ui/systemColors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartAccessoryContent, NativeCartAccessory } from "../src/navigation/CartAccessory";
import { getCartAccessorySummary, getCartNavigationState } from "../src/navigation/cartAccessoryModel";
import {
  addCartItemAtLocation,
  calculateItemCount,
  calculateSubtotalCents,
  clearCartSnapshot,
  removeCartSnapshotItem,
  setCartSnapshotItemQuantity
} from "../src/cart/model";

const runtime = vi.hoisted(() => ({
  placement: "regular" as "regular" | "inline",
  dark: false
}));
vi.stubGlobal("React", React);
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
vi.mock("expo-router/native-tabs", () => ({
  NativeTabs: { BottomAccessory: { usePlacement: () => runtime.placement } }
}));
vi.mock("react-native", () => ({
  Pressable: "Pressable",
  View: "View",
  Text: "Text",
  useColorScheme: () => (runtime.dark ? "dark" : "light"),
  StyleSheet: { create: (styles: unknown) => styles }
}));

describe("adaptive cart accessory", () => {
  beforeEach(() => {
    runtime.placement = "regular";
    runtime.dark = false;
  });

  it("derives empty/nonempty/empty transitions from the actual shared cart model", () => {
    const empty = clearCartSnapshot();
    expect(getCartNavigationState(calculateItemCount(empty.items), "ios", "26.0")).toMatchObject({
      minimizeBehavior: "never",
      showNativeAccessory: false
    });
    const added = addCartItemAtLocation(empty, "test-location", {
      menuItemId: "latte",
      itemName: "Latte",
      basePriceCents: 725,
      customizationGroups: [],
      quantity: 2
    });
    if (!added.ok) throw new Error("Cart addition failed");
    expect(getCartNavigationState(calculateItemCount(added.cart.items), "ios", "26.0")).toMatchObject({
      minimizeBehavior: "onScrollDown",
      showNativeAccessory: true
    });
    expect(
      getCartAccessorySummary(calculateItemCount(added.cart.items), calculateSubtotalCents(added.cart.items))
    ).toMatchObject({ countLabel: "2 items", subtotalLabel: "$14.50" });
    const updated = setCartSnapshotItemQuantity(added.cart, added.cart.items[0].lineId, 3);
    expect(
      getCartAccessorySummary(calculateItemCount(updated.items), calculateSubtotalCents(updated.items))
    ).toMatchObject({ countLabel: "3 items", subtotalLabel: "$21.75" });
    const removed = removeCartSnapshotItem(updated, updated.items[0].lineId);
    expect(getCartNavigationState(calculateItemCount(removed.items), "ios", "26.0")).toMatchObject({
      minimizeBehavior: "never",
      showNativeAccessory: false
    });
  });

  it.each(["regular", "inline"] as const)("opens the same cart from %s placement", (placement) => {
    runtime.placement = placement;
    const onOpenCart = vi.fn();
    const summary = getCartAccessorySummary(2, 1450);
    const accessory = NativeCartAccessory({ summary, onOpenCart });
    expect(accessory.props.placement).toBe(placement);
    expect(accessory.props.summary).toBe(summary);
    const button = CartAccessoryContent(accessory.props);
    expect(button.props.accessibilityRole).toBe("button");
    expect(button.props.accessibilityLabel).toBe("Open cart, 2 items, subtotal $14.50");
    button.props.onPress();
    expect(onOpenCart).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("delegates text/icon appearance to the native semantic label for dark appearance=%s", (dark) => {
    runtime.dark = dark;
    const button = CartAccessoryContent({
      summary: getCartAccessorySummary(1, 525),
      onOpenCart: vi.fn()
    });
    expect(button.props.children[0].props.color).toBe(uiPalette.text);
    expect(button.props.accessibilityLabel).toContain("1 item,");
  });

  it.each(["regular", "inline"] as const)("distributes count and subtotal across the %s pill", (placement) => {
    const button = CartAccessoryContent({
      summary: getCartAccessorySummary(2, 1450),
      onOpenCart: vi.fn(),
      placement
    });
    // Static styles survive NativeWind interop; callback styles lose the native row layout.
    expect(Array.isArray(button.props.style)).toBe(true);
    expect(button.props.style[0]).toMatchObject({
      width: "100%",
      flexDirection: "row",
      alignItems: "center"
    });
    const copy = button.props.children[1];
    expect(copy.props.style).toMatchObject({
      flex: 1,
      flexDirection: "row",
      justifyContent: "space-between"
    });
    expect(copy.props.children[0].props.children).toBe("2 items");
    expect(copy.props.children[1].props.children).toBe("$14.50");
    expect(copy.props.children[1].props.style).toContainEqual(
      expect.objectContaining({ flexShrink: 0, textAlign: "right" })
    );
    expect(button.props.children[2].props.name).toBe("arrow-forward");
  });

  it.each([
    ["ios", "18.6"],
    ["android", 36],
    ["web", "1"]
  ] as const)("provides a regular fallback without native minimization on %s", (platform, version) => {
    expect(getCartNavigationState(2, platform, version)).toMatchObject({
      showFallbackAccessory: true,
      showNativeAccessory: false,
      minimizeBehavior: undefined
    });
    expect(getCartNavigationState(0, platform, version).showFallbackAccessory).toBe(false);
  });

  it("uses supported native minimize behavior names on iOS 27 without inventing an imperative reset", () => {
    expect(getCartNavigationState(2, "ios", "27.0").minimizeBehavior).toBe("onScrollDown");
    expect(getCartNavigationState(0, "ios", "27.0").minimizeBehavior).toBe("never");
  });
});
