import * as React from "react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HistoryLayout from "../app/(tabs)/orders/_layout";
import HistoryRoute from "../app/(tabs)/orders/index";
import { bottomTabs } from "../src/navigation/bottomTabs";

const runtime = vi.hoisted(() => ({ push: vi.fn(), dismiss: vi.fn(), available: true }));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => runtime.available ? { nativeHeaderConfigurationVersion: 1, supportsNativeBarMinimization: true } : null }));
vi.stubGlobal("React", React);
vi.mock("expo-router", () => ({ Stack: Object.assign("Stack", { Screen: "StackScreen" }), useRouter: () => ({ push: runtime.push, dismiss: runtime.dismiss }) }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" }, Pressable: "Pressable", Text: "Text", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
vi.mock("expo-symbols", () => ({ SymbolView: "Symbol" }));
vi.mock("../src/ui/system", () => ({ uiPalette: { background: "#F7F4ED", text: "#171513" } }));
vi.mock("../src/screens/OrdersScreen", () => ({ OrdersScreen: "OrdersScreen" }));
vi.mock("../src/navigation/TabScreen", () => ({ TabScreen: "TabScreen" }));
vi.mock("../src/account/AccountSheetSurface", () => ({ AccountSheetSurface: "AccountSheetSurface" }));

describe("native History header", () => {
  beforeEach(() => { runtime.available = true; });

  it("uses a compact centered title without a large scrolling header", () => {
    const options = HistoryLayout().props.children.props.screenOptions;
    expect(options).toMatchObject({
      title: "Orders", headerShown: true, headerLargeTitleEnabled: false,
      headerTitleAlign: "center", headerBackButtonDisplayMode: "minimal", headerTransparent: true, headerShadowVisible: false,
      headerBlurEffect: "none", scrollEdgeEffects: { top: "hidden" }
    });
    expect(options.headerStyle).toEqual({ backgroundColor: "transparent" });
    expect(options).not.toHaveProperty("headerSearchBarOptions");
    expect(options).not.toHaveProperty("headerLeft");
  });

  it("closes the parent sheet from the native close button and fallback", () => {
    runtime.available = false;
    const options = HistoryLayout().props.children.props.children[0].props.options;
    const close = options.unstable_headerLeftItems()[0];
    expect(close).toMatchObject({ type: "button", icon: { type: "sfSymbol", name: "xmark" } });
    close.onPress();
    options.headerLeft().props.onPress();
    expect(runtime.dismiss).toHaveBeenCalledTimes(2);
  });

  it.each([true, false])("removes Account from native and fallback Orders headers (native: %s)", (available) => {
    runtime.available = available;
    const options = HistoryLayout().props.children.props.screenOptions;
    expect(options.unstable_headerRightItems()).toEqual([]);
    expect(options.headerRight()).toBeNull();
  });

  it("renames the destination without changing its order route identity", () => {
    expect(bottomTabs.map((tab) => tab.name)).toEqual(["home", "menu", "rewards", "search"]);
    expect(bottomTabs.some((tab) => String(tab.name) === "orders")).toBe(false);
    expect(HistoryRoute().type).toBe("OrdersScreen");
    const sheet = HistoryLayout();
    expect(sheet.type).toBe("AccountSheetSurface");
    expect(sheet.props.contentTopPadding).toBe(8);
    expect(sheet.props.children.props.screenOptions.contentStyle.backgroundColor).toBe("transparent");
  });

  it("removes both custom floating headers and keeps scroll content discoverable", () => {
    const screen = readFileSync(new URL("../src/screens/OrdersScreen.tsx", import.meta.url), "utf8");
    const loading = readFileSync(new URL("../src/orders/OrdersLoadingState.tsx", import.meta.url), "utf8");
    for (const source of [screen, loading]) expect(source).not.toContain("pageHeaderFloating");
    for (const source of [screen, loading]) expect(source).not.toContain('label="Recent orders"');
    expect(screen).not.toContain("orderHistory.length} total");
    expect(screen).toContain("const headerOffset = nativeHeaderHeight + 12");
    expect(screen).toContain('contentInsetAdjustmentBehavior={nativeScrollingHeader ? "automatic" : "never"}');
    expect(screen).toContain("paddingTop: nativeScrollingHeader ? 12 : headerOffset");
    expect(screen).toContain("onLayout={registerScrollEdge}");
    expect(screen).not.toContain("onRefresh=");
    expect(screen).not.toContain("Past Orders");
    const month = readFileSync(new URL("../app/(tabs)/orders/month.tsx", import.meta.url), "utf8");
    expect(month).toContain('pathname: "/(tabs)/orders/detail"');
    expect(screen).toContain("<OrdersArchive orders={orderHistory}");
    expect(loading).toContain("paddingTop: contentTopInset");
    expect(loading).not.toContain("<ScreenBackdrop");
    expect(loading).not.toContain("<TabBarDepthBackdrop");
    expect(screen).toContain("const contentBottomInset = 24");
    expect(screen).toContain("!activeOrder ? styles.firstSection : null");
    expect(loading).toContain('accessibilityLabel="Loading orders"');
    expect(loading).not.toContain("pickupCodeBlock");
  });
});
