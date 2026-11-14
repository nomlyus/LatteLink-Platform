import * as React from "react";
import { uiPalette } from "../src/ui/systemColors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bottomTabs, formatCartTabCount, getBottomTabPresentation } from "../src/navigation/bottomTabs";
import { BottomTabNavigator } from "../src/navigation/BottomTabNavigator.web";
import { PillTabButtons, PillTabIcons } from "../src/navigation/PillTabItems";
import { TabBarCartButton } from "../src/navigation/TabBarCartButton";
import type { PillTabBarProps } from "../src/navigation/pillTabBarShared";

const runtime = vi.hoisted(() => ({ itemCount: 0, push: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("expo-router", () => ({
  Tabs: Object.assign(() => null, { Screen: () => null }),
  useRouter: () => ({ push: runtime.push })
}));
vi.mock("../src/navigation/PillTabBar", () => ({ PillTabBar: () => null }));
vi.mock("react-native", () => ({
  View: "View",
  Pressable: "Pressable",
  Text: "Text",
  Platform: { OS: "ios" },
  StyleSheet: { create: (value: unknown) => value }
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
vi.mock("expo-blur", () => ({ BlurView: "BlurView" }));
vi.mock("expo-glass-effect", () => ({ GlassView: "GlassView" }));
vi.mock("../src/ui/system", () => ({ uiPalette: { text: "#171513" }, uiTypography: { bodyFamily: "System" } }));
vi.mock("../src/cart/store", () => ({ useCart: () => ({ itemCount: runtime.itemCount }) }));

type TestElementProps = {
  children?: React.ReactNode;
  onPress?: () => void;
  accessibilityState?: { selected?: boolean };
  accessibilityLabel?: string;
  name?: string;
  size?: number;
  color?: string;
};

function findElements(node: React.ReactNode, type: string): React.ReactElement<TestElementProps>[] {
  return React.Children.toArray(node).flatMap((child) => {
    if (!React.isValidElement<TestElementProps>(child)) return [];
    return [...(child.type === type ? [child] : []), ...findElements(child.props.children, type)];
  });
}

function fixture(prevented = false) {
  const emit = vi.fn(() => ({ defaultPrevented: prevented }));
  const navigate = vi.fn();
  // Only the native navigation fields consumed by these pure presentation components.
  const props = {
    state: {
      index: 0,
      routes: bottomTabs.map((tab) => ({
        key: `${tab.name}-key`,
        name: tab.name,
        params: tab.name === "menu" ? { categoryId: "coffee" } : undefined
      }))
    },
    descriptors: Object.fromEntries(bottomTabs.map((tab) => [`${tab.name}-key`, { options: { title: tab.title } }])),
    emitter: { emit },
    navigateToTab: navigate
  } as unknown as PillTabBarProps;
  return { props, emit, navigate };
}

describe("bottom tab navigation", () => {
  beforeEach(() => {
    runtime.itemCount = 0;
    vi.clearAllMocks();
  });

  it("keeps the web fallback's four routes, order, titles, and hidden headers", () => {
    const tree = BottomTabNavigator();
    expect(tree.props.screenOptions).toEqual({ headerShown: false, tabBarShowLabel: false });
    expect(
      tree.props.children.map((child: React.ReactElement<{ name: string; options: { title: string } }>) => ({
        name: child.props.name,
        title: child.props.options.title
      }))
    ).toEqual([
      { name: "home", title: "Home" },
      { name: "menu", title: "Menu" },
      { name: "rewards", title: "Rewards" },
      { name: "search", title: "Search" }
    ]);
    expect(tree.props).not.toHaveProperty("backBehavior");
  });

  it("keeps menu icon sizing and explicit title/unknown-route fallbacks", () => {
    expect(getBottomTabPresentation("menu")).toEqual({
      label: "Menu",
      icons: { default: "cafe-outline", active: "cafe" },
      iconSize: 28
    });
    expect(getBottomTabPresentation("home", "Welcome").label).toBe("Welcome");
    expect(getBottomTabPresentation("home", "").label).toBe("");
    expect(getBottomTabPresentation("unknown")).toEqual({
      label: "unknown",
      icons: { default: "ellipse-outline", active: "ellipse" },
      iconSize: 24
    });
  });

  it("emits tabPress before selecting the existing route by key, retaining its parameters", () => {
    const { props, emit, navigate } = fixture();
    const buttons = findElements(PillTabButtons({ ...props, activeIndex: 0 }), "Pressable");
    buttons[1]!.props.onPress!();
    expect(emit).toHaveBeenCalledWith({ type: "tabPress", target: "menu-key", canPreventDefault: true });
    expect(navigate).toHaveBeenCalledWith("menu-key");
    expect(emit.mock.invocationCallOrder[0]).toBeLessThan(navigate.mock.invocationCallOrder[0]!);
  });

  it("preserves prevented navigation and focused-tab press events", () => {
    const blocked = fixture(true);
    findElements(PillTabButtons({ ...blocked.props, activeIndex: 0 }), "Pressable")[1]!.props.onPress!();
    expect(blocked.emit).toHaveBeenCalledOnce();
    expect(blocked.navigate).not.toHaveBeenCalled();
    const focused = fixture();
    findElements(PillTabButtons({ ...focused.props, activeIndex: 0 }), "Pressable")[0]!.props.onPress!();
    expect(focused.emit).toHaveBeenCalledOnce();
    expect(focused.navigate).not.toHaveBeenCalled();
  });

  it("keeps drag-preview selection and custom accessibility labels", () => {
    const { props } = fixture();
    props.descriptors["menu-key"]!.options.tabBarAccessibilityLabel = "Browse drinks";
    const buttons = findElements(PillTabButtons({ ...props, activeIndex: 1 }), "Pressable");
    expect(buttons[1]!.props.accessibilityState).toEqual({ selected: true });
    expect(buttons[0]!.props.accessibilityState).toEqual({});
    expect(buttons[1]!.props.accessibilityLabel).toBe("Browse drinks");
  });

  it.each(["classic", "glass"] as const)("preserves %s icons, sizes, and active tint", (variant) => {
    const { props } = fixture();
    const base = findElements(PillTabIcons({ ...props, active: false, variant }), "Icon");
    const active = findElements(PillTabIcons({ ...props, active: true, variant }), "Icon");
    expect(base.map((icon) => icon.props.name)).toEqual([
      "home-outline",
      "cafe-outline",
      "gift-outline",
      "search-outline"
    ]);
    expect(active.map((icon) => icon.props.name)).toEqual(["home", "cafe", "gift", "search"]);
    expect(base[1]!.props.size).toBe(28);
    expect(active[0]!.props.color).toBe(uiPalette.chromeText);
    expect(base[0]!.props.color).toBe(uiPalette.chromeMuted);
  });

  it.each(["classic", "glass"] as const)("keeps the %s cart shortcut conditional and modal-owned", (variant) => {
    expect(TabBarCartButton({ variant })).toBeNull();
    runtime.itemCount = 3;
    const button = TabBarCartButton({ variant });
    expect(button?.props.accessibilityLabel).toBe("Open cart");
    button?.props.onPress();
    expect(runtime.push).toHaveBeenCalledWith("/cart");
    const surface = findElements(button, variant === "glass" ? "GlassView" : "BlurView");
    expect(surface).toHaveLength(1);
    expect(findElements(button, "Text")[0]!.props.children).toBe("3");
    runtime.itemCount = 100;
    expect(findElements(TabBarCartButton({ variant }), "Text")[0]!.props.children).toBe("99+");
    expect(formatCartTabCount(99)).toBe("99");
  });
});
