import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartCheckoutToolbar, CartHeader, cartHeaderOptions } from "../src/cart/CartNavigation";

const router = vi.hoisted(() => ({ canGoBack: vi.fn(() => true), back: vi.fn(), replace: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("expo", () => ({ requireOptionalNativeModule: () => ({}) }));
vi.mock("expo-router", () => ({
  useRouter: () => router,
  Stack: { Screen: "NativeScreen", Toolbar: Object.assign("NativeToolbar", { Button: "NativeButton", Spacer: "NativeSpacer" }) }
}));
vi.mock("expo-symbols", () => ({ SymbolView: "SymbolView" }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" }, Pressable: "Pressable" }));
vi.mock("../src/ui/system", () => ({ uiPalette: { backgroundAlt: "systemGroupedBackground", text: "label", primary: "forest" } }));

describe("Cart native navigation", () => {
  beforeEach(() => { vi.clearAllMocks(); router.canGoBack.mockReturnValue(true); });
  it("uses a native Cart title and SF Symbol close action", () => {
    expect(cartHeaderOptions).toMatchObject({ title: "Cart", headerShown: true, headerShadowVisible: false });
    expect(cartHeaderOptions).toMatchObject({
      headerTransparent: true,
      headerBlurEffect: "none",
      headerStyle: { backgroundColor: "transparent" },
      scrollEdgeEffects: { top: "soft" }
    });
    const close = CartHeader().props.options.unstable_headerLeftItems()[0];
    expect(close.icon).toEqual({ type: "sfSymbol", name: "xmark" });
    close.onPress();
    expect(router.back).toHaveBeenCalledOnce();
  });
  it("has a safe menu fallback for direct Cart links", () => {
    router.canGoBack.mockReturnValue(false);
    CartHeader().props.options.unstable_headerLeftItems()[0].onPress();
    expect(router.replace).toHaveBeenCalledWith("/(tabs)/(navigation)/menu");
  });
  it("places Clear in the native trailing header and opens confirmation through its callback", () => {
    const onClear = vi.fn();
    const actions = CartHeader({ onClear }).props.options.unstable_headerRightItems();
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: "button", label: "Clear", accessibilityLabel: "Clear cart" });
    actions[0].onPress();
    expect(onClear).toHaveBeenCalledOnce();
    expect(CartHeader().props.options.unstable_headerRightItems()).toEqual([]);
  });
  it("blocks sheet dismissal while native payment is in progress", () => {
    const options = CartHeader({ paymentInProgress: true }).props.options;
    expect(options.gestureEnabled).toBe(false);
    const close = options.unstable_headerLeftItems()[0];
    expect(close.disabled).toBe(true);
    close.onPress();
    expect(router.back).not.toHaveBeenCalled();
  });
  it("renders a direct Pay action without repeating the amount", () => {
    const toolbar = CartCheckoutToolbar({ contentWidth: 393, label: "Pay $4.75", disabled: false, onPress: vi.fn() });
    expect(toolbar.props.children[1].props.children).toBe("Pay $4.75");
  });
  it.each([false, true])("keeps checkout as one visible native action with disabled=%s", (disabled) => {
    const onPress = vi.fn();
    const toolbar = CartCheckoutToolbar({ contentWidth: 393, label: "Continue to checkout", value: "$14.50", disabled, onPress });
    expect(toolbar.props.placement).toBe("bottom");
    const button = toolbar.props.children[1];
    expect(button.type).toBe("NativeButton");
    expect(button.props).toMatchObject({ variant: "prominent", disabled, children: "Continue to checkout · $14.50" });
    button.props.onPress();
    expect(onPress).toHaveBeenCalledOnce();
  });
});
