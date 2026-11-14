import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MenuCustomizeHeader } from "../src/menu/MenuCustomizeHeader";
import { tabDestinations } from "../src/navigation/destinations";

const runtime = vi.hoisted(() => ({ canGoBack: true, back: vi.fn(), replace: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("expo-router", () => ({ Stack: { Screen: "StackScreen" }, useRouter: () => ({ canGoBack: () => runtime.canGoBack, back: runtime.back, replace: runtime.replace }) }));
vi.mock("expo-symbols", () => ({ SymbolView: "Symbol" }));
vi.mock("react-native", () => ({ Pressable: "Pressable", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("../src/ui/system", () => ({ uiPalette: { text: "system-label" } }));

describe("item image overlay header", () => {
  beforeEach(() => { runtime.canGoBack = true; vi.clearAllMocks(); });
  it("lets the image extend under a transparent native header with a native close symbol", () => {
    const options = MenuCustomizeHeader().props.options;
    expect(options).toMatchObject({ title: "", headerShown: true, headerTransparent: true, headerBlurEffect: "none", headerShadowVisible: false, headerBackVisible: false });
    const close = options.unstable_headerLeftItems()[0];
    expect(close).toMatchObject({ type: "button", icon: { type: "sfSymbol", name: "xmark" }, accessibilityLabel: "Close item" });
    close.onPress();
    expect(runtime.back).toHaveBeenCalledOnce();
  });
  it("keeps direct-link dismissal pointed at Menu", () => {
    runtime.canGoBack = false;
    MenuCustomizeHeader().props.options.unstable_headerLeftItems()[0].onPress();
    expect(runtime.replace).toHaveBeenCalledWith(tabDestinations.menu);
  });
  it("keeps the fallback close control accessible with a native symbol", () => {
    const close = MenuCustomizeHeader().props.options.headerLeft();
    expect(close.props).toMatchObject({ accessibilityRole: "button", accessibilityLabel: "Close item", style: { width: 44, height: 44 } });
    expect(close.props.children.props.name.ios).toBe("xmark");
    close.props.onPress();
    expect(runtime.back).toHaveBeenCalledOnce();
  });
});
