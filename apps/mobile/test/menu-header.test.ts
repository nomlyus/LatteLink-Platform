import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nativeAppleSearchHeaderOptions } from "../src/search/nativeAppleSearchHeaderOptions";
import MenuLayout from "../app/(tabs)/(navigation)/menu/_layout";
import MenuRoute from "../app/(tabs)/(navigation)/menu/index";
import { uiPalette } from "../src/ui/systemColors";

const runtime = vi.hoisted(() => ({ push: vi.fn(), available: true }));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => runtime.available ? { nativeHeaderConfigurationVersion: 1, supportsNativeBarMinimization: true } : null }));

vi.stubGlobal("React", React);
vi.mock("expo-router", () => ({ Stack: "Stack", useRouter: () => ({ push: runtime.push }) }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" }, Pressable: "Pressable", View: "View", Text: "Text", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
vi.mock("../src/ui/system", () => ({ uiPalette: { background: "#F7F4ED", text: "#171513", textSecondary: "#605B55" } }));
vi.mock("../src/screens/MenuScreen", () => ({ MenuScreen: "MenuScreen" }));
vi.mock("../src/navigation/TabScreen", () => ({ TabScreen: "TabScreen" }));

describe("native Menu header", () => {
  beforeEach(() => { runtime.available = true; });

  it("aligns the native title with Account and defers the content edge until scroll layout", () => {
    const options = MenuLayout().props.screenOptions;
    const search = nativeAppleSearchHeaderOptions(() => {}, true);
    expect(options).toMatchObject({
      title: "Menu", headerShown: true, headerLargeTitleEnabled: true,
      headerTransparent: true, headerShadowVisible: false, headerLargeTitleShadowVisible: false,
      headerTitleStyle: search.headerTitleStyle,
      headerLargeTitleStyle: search.headerLargeTitleStyle,
      unstable_nativeProps: { headerConfig: {
        largeTitleDisplayMode: "inline", navigationBarMinimizationBehavior: "onScrollDown", hidesBarsOnSwipe: false
      } },
      headerBlurEffect: "none", scrollEdgeEffects: { top: "automatic" }
    });
    expect(options.headerStyle).toBeUndefined();
    expect(options.headerLargeStyle).toEqual({ backgroundColor: "transparent" });
    expect(search.scrollEdgeEffects).toEqual({ top: "soft" });
    expect(search.unstable_nativeProps.headerConfig.largeTitleDisplayMode).toBe("inline");
    expect(options).not.toHaveProperty("headerSearchBarOptions");
    expect(options).not.toHaveProperty("headerLeft");
  });

  it("preserves the leading title fallback on clients without the native extension", () => {
    runtime.available = false;
    const options = MenuLayout().props.screenOptions;
    expect(options.headerTitle).toBe("");
    const title = options.headerLeft();
    expect(title.props.children).toBe("Menu");
    expect(title.props.style).toMatchObject({ fontSize: 34, fontWeight: "700", letterSpacing: -0.8 });
    expect(options.unstable_headerLeftItems()[0]).toMatchObject({ type: "custom", hidesSharedBackground: true });
  });

  it("opens the existing Account sheet from both native and fallback account controls", () => {
    runtime.push.mockClear();
    const options = MenuLayout().props.screenOptions;
    const account = options.unstable_headerRightItems()[0];
    expect(account).toMatchObject({ accessibilityLabel: "Open account", sharesBackground: false, tintColor: uiPalette.chromeText, icon: { type: "sfSymbol", name: "person" } });
    account.onPress();
    options.headerRight().props.onPress();
    expect(runtime.push.mock.calls).toEqual([["/(tabs)/account"], ["/(tabs)/account"]]);
  });

  it("keeps Menu inside the existing native-tab screen wrapper", () => {
    const route = MenuRoute();
    expect(route.type).toBe("TabScreen");
    expect(route.props.children.type).toBe("MenuScreen");
  });
});
