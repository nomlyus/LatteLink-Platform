import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { CartCheckoutToolbar } from "../src/cart/CartCheckoutToolbar.ios";

vi.stubGlobal("React", React);
vi.mock("expo-router", () => ({ Stack: { Toolbar: Object.assign("NativeToolbar", { View: "NativeToolbarView" }) } }));
vi.mock("@expo/ui/swift-ui", () => ({ Host: "NativeHost", Button: "SwiftUIButton", Text: "NativeText" }));
vi.mock("@expo/ui/swift-ui/modifiers", () => Object.fromEntries(
  ["accessibilityLabel", "buttonStyle", "controlSize", "disabled", "dynamicTypeSize", "frame"].map((name) => [name, (value: unknown) => ({ name, value })])
));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ left: 0, right: 0 }) }));
vi.mock("../src/ui/system", () => ({ uiPalette: { primary: "forest" } }));

describe("full-width native Cart payment button", () => {
  it.each([393, 430, 768])("fills the measured %ipt sheet within native toolbar margins", (contentWidth) => {
    const toolbar = CartCheckoutToolbar({ contentWidth, label: "Pay $4.75", disabled: false, onPress: vi.fn() });
    if (!toolbar) throw new Error("Expected measured toolbar");
    expect(React.Children.count(toolbar.props.children)).toBe(1);
    const host = toolbar.props.children.props.children;
    expect(host.props.style.width).toBe(contentWidth - 48);
    const button = host.props.children;
    expect(button.type).toBe("SwiftUIButton");
    expect(button.props.modifiers).toContainEqual({ name: "buttonStyle", value: "glassProminent" });
    expect(button.props.children.props.modifiers).toContainEqual({ name: "frame", value: { maxWidth: Infinity } });
  });
  it("keeps progress text inside the disabled native payment button", () => {
    const onPress = vi.fn();
    const toolbar = CartCheckoutToolbar({ contentWidth: 393, label: "Preparing secure payment…", disabled: true, onPress });
    if (!toolbar) throw new Error("Expected measured toolbar");
    const button = toolbar.props.children.props.children.props.children;
    expect(button.props.children.props.children).toBe("Preparing secure payment…");
    expect(button.props.modifiers).toContainEqual({ name: "disabled", value: true });
    expect(button.props.modifiers).toContainEqual({ name: "accessibilityLabel", value: "Preparing secure payment…" });
    expect(button.props.onPress).toBe(onPress);
  });
  it("waits for the actual sheet width rather than using the phone's window width", () => {
    expect(CartCheckoutToolbar({ contentWidth: 0, label: "Pay", disabled: false, onPress: vi.fn() })).toBeNull();
  });
});
