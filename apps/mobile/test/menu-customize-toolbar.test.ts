import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { MenuCustomizeToolbar } from "../src/menu/MenuCustomizeToolbar";

vi.stubGlobal("React", React);
vi.mock("expo", () => ({ requireOptionalNativeModule: () => ({}) }));
vi.mock("expo-router", () => ({ Stack: { Toolbar: Object.assign("NativeToolbar", { View: "NativeBarView" }) } }));
vi.mock("@expo/ui/swift-ui", () => ({ Host: "NativeHost", GlassEffectContainer: "NativeGlassContainer", HStack: "NativeRow", Button: "NativeButton", Text: "NativeText" }));
vi.mock("@expo/ui/swift-ui/modifiers", () => Object.fromEntries(["accessibilityLabel", "buttonStyle", "controlSize", "disabled", "dynamicTypeSize", "font", "foregroundStyle", "frame", "glassEffect", "labelStyle", "monospacedDigit"].map((name) => [name, (value: unknown) => ({ name, value })])));
vi.mock("react-native", () => ({ Platform: { OS: "ios" }, StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ left: 0, right: 0 }) }));
vi.mock("../src/ui/system", () => ({ uiPalette: { text: "label", primary: "forest" } }));
vi.mock("../src/menu/catalog", () => ({ formatUsd: (cents: number) => `$${(cents / 100).toFixed(2)}` }));

function props() { return { contentWidth: 393, quantity: 2, maxQuantity: 20, totalCents: 1350, canAddToCart: true, onQuantityChange: vi.fn(), onAddToCart: vi.fn() }; }
function controls(input = props()) {
  const toolbar = MenuCustomizeToolbar(input);
  const item = toolbar.props.children;
  const host = item.props.children;
  const row = host.props.children.props.children;
  const [quantity, add] = row.props.children;
  const [minus, count, plus] = quantity.props.children;
  return { toolbar, item, host, row, quantity, add, minus, count, plus };
}

describe("native bottom purchase toolbar", () => {
  it("presents both controls as one native item so Add cannot overflow independently", () => {
    const input = props();
    const { toolbar, item, quantity, add, minus, count, plus } = controls(input);
    expect(toolbar.props.placement).toBe("bottom");
    expect(React.Children.count(toolbar.props.children)).toBe(1);
    expect(item.type).toBe("NativeBarView");
    expect(item.props.hidesSharedBackground).toBe(true);
    expect(quantity.props.modifiers).toContainEqual({ name: "glassEffect", value: { glass: { variant: "regular", interactive: true }, shape: "capsule" } });
    expect(minus.props.systemImage).toBe("minus");
    expect(count.props.children).toBe("2");
    expect(plus.props.systemImage).toBe("plus");
    expect(add.props.children.props.children).toBe("Add to Cart");
    expect(add.props.modifiers).toContainEqual({ name: "buttonStyle", value: "glassProminent" });
    expect(add.props.modifiers).toContainEqual({ name: "accessibilityLabel", value: "Add 2 items to cart, $13.50" });
    add.props.onPress();
    expect(input.onAddToCart).toHaveBeenCalledOnce();
  });
  it("keeps quantity changes bounded", () => {
    const input = props();
    const { minus, plus } = controls(input);
    minus.props.onPress();
    plus.props.onPress();
    expect(input.onQuantityChange.mock.calls).toEqual([[1], [3]]);
    expect(controls({ ...input, quantity: 1 }).minus.props.modifiers).toContainEqual({ name: "disabled", value: true });
    expect(controls({ ...input, quantity: 20 }).plus.props.modifiers).toContainEqual({ name: "disabled", value: true });
  });
  it("disables Add to Cart when scope or loading prohibits it", () => {
    expect(controls({ ...props(), canAddToCart: false }).add.props.modifiers).toContainEqual({ name: "disabled", value: true });
  });
  it.each([393, 430, 768])("uses the measured sheet width %i with a 1:2 split", (width) => {
    const { host, row, quantity, add } = controls({ ...props(), contentWidth: width });
    const quantityWidth = quantity.props.modifiers.find((modifier: { name: string }) => modifier.name === "frame").value.width;
    const addWidth = add.props.modifiers.find((modifier: { name: string }) => modifier.name === "frame").value.width;
    expect(addWidth).toBeCloseTo(quantityWidth * 2);
    expect(quantityWidth + addWidth + row.props.spacing).toBeCloseTo(host.props.style[1].width);
    expect(host.props.style[1].width + 48).toBeCloseTo(width);
  });
});
