import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BottomTabNavigator } from "../src/navigation/BottomTabNavigator";
import { BottomTabNavigator as AndroidBottomTabNavigator } from "../src/navigation/BottomTabNavigator.android";
import { NativeTabs } from "expo-router/native-tabs";
import { TabScreen } from "../src/navigation/TabScreen";
import { getNativeTabContentBottomInset, useTabContentLayout } from "../src/navigation/tabContentLayout";

const runtime = vi.hoisted(() => ({
  focused: true,
  itemCount: 0,
  subtotalCents: 0,
  platform: "ios",
  version: "26.0",
  push: vi.fn()
}));
vi.stubGlobal("React", React);
vi.mock("expo-router/native-tabs", () => ({
  NativeTabs: Object.assign(() => null, {
    Trigger: Object.assign(() => null, { Label: () => null, Icon: () => null }),
    BottomAccessory: Object.assign(() => null, { usePlacement: () => "regular" })
  })
}));
vi.mock("expo-router", () => ({ useIsFocused: () => runtime.focused, useRouter: () => ({ push: runtime.push }) }));
vi.mock("../src/cart/store", () => ({
  useCart: () => ({ itemCount: runtime.itemCount, subtotalCents: runtime.subtotalCents })
}));
vi.mock("../src/ui/system", () => ({ uiPalette: { background: "#F7F4ED" } }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-native", () => ({
  View: ({ children, collapsable }: React.PropsWithChildren<{ collapsable?: boolean }>) =>
    React.createElement("div", { "data-preserve-native-view": collapsable === false ? true : undefined }, children),
  Text: ({ children }: React.PropsWithChildren) => React.createElement("span", null, children),
  Pressable: ({ children }: React.PropsWithChildren) => React.createElement("button", null, children),
  useColorScheme: () => "light",
  Platform: {
    get OS() {
      return runtime.platform;
    },
    get Version() {
      return runtime.version;
    }
  },
  StyleSheet: { create: (value: unknown) => value }
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 83, left: 0, right: 0 })
}));
vi.mock("react-native-screens/experimental", () => ({
  SafeAreaView: ({ children }: React.PropsWithChildren) =>
    React.createElement("div", { "data-safe-area": true }, children)
}));

function navigatorTree() {
  let tree: ReturnType<typeof BottomTabNavigator> | undefined;
  function Probe() {
    tree = BottomTabNavigator();
    return null;
  }
  renderToStaticMarkup(React.createElement(Probe));
  if (!tree) throw new Error("Missing navigator");
  return tree;
}
function ContentProbe() {
  return React.createElement(
    "main",
    { "data-content-bottom": useTabContentLayout()?.contentBottomInset },
    "Mounted content"
  );
}
function renderScreen() {
  return renderToStaticMarkup(React.createElement(TabScreen, null, React.createElement(ContentProbe)));
}

describe("native tab navigation", () => {
  beforeEach(() => {
    Object.assign(runtime, { focused: true, itemCount: 0, subtotalCents: 0, platform: "ios", version: "26.0" });
    runtime.push.mockClear();
  });

  it("uses native tabs on both iOS and Android, never a JS tab bar", () => {
    expect(AndroidBottomTabNavigator).toBe(BottomTabNavigator);
    const tree = navigatorTree();
    expect(tree.type).toBe(NativeTabs);
    expect(tree.props.backBehavior).toBe("initialRoute");
    expect(tree.props).not.toHaveProperty("tabBar");
    expect(tree.props.backgroundColor).toBe("transparent");
    expect(tree.props.shadowColor).toBe("transparent");
    expect(tree.props.labelVisibilityMode).toBe("unlabeled");
  });

  it("keeps Home, Menu, Orders and Search in order with only the final tab assigned the search role", () => {
    const tabs = navigatorTree().props.children[0];
    expect(tabs.map((tab: React.ReactElement<{ name: string }>) => tab.props.name)).toEqual([
      "home",
      "menu",
      "rewards",
      "search"
    ]);
    expect(tabs.map((tab: React.ReactElement<{ accessibilityLabel: string }>) => tab.props.accessibilityLabel)).toEqual(
      ["Home", "Menu", "Rewards", "Search"]
    );
    expect(tabs.map((tab: React.ReactElement<{ role?: string }>) => tab.props.role)).toEqual([
      undefined,
      undefined,
      undefined,
      "search"
    ]);
    for (const tab of tabs) {
      expect(tab.type).toBe(NativeTabs.Trigger);
      expect(tab.props.children[0].props.hidden).toBe(true);
      expect(tab.props.children[1].props.sf.default).toBeTruthy();
      expect(tab.props.children[1].props.md).toBeTruthy();
      expect(tab.props.disableAutomaticContentInsets).toBe(true);
      expect(tab.props.disablePopToTop).toBe(true);
      expect(tab.props.disableScrollToTop).toBe(true);
    }
  });

  it("keeps an empty cart expanded without an accessory", () => {
    const tree = navigatorTree();
    expect(tree.props.minimizeBehavior).toBe("never");
    expect(tree.props.children[1]).toBeNull();
  });

  it("enables native scroll minimization and one accessory for a nonempty cart", () => {
    runtime.itemCount = 2;
    runtime.subtotalCents = 1450;
    const tree = navigatorTree();
    expect(tree.props.minimizeBehavior).toBe("onScrollDown");
    const accessory = tree.props.children[1];
    expect(accessory && accessory.type).toBe(NativeTabs.BottomAccessory);
    expect(accessory && accessory.props.children.props.summary.subtotalLabel).toBe("$14.50");
    expect(accessory && accessory.props.children.props.summary.countLabel).toBe("2 items");
    if (accessory) accessory.props.children.props.onOpenCart();
    expect(runtime.push).toHaveBeenCalledWith("/cart");
  });

  it("updates the accessory snapshot without assigning a cart-dependent navigator key", () => {
    runtime.itemCount = 1;
    runtime.subtotalCents = 500;
    const first = navigatorTree();
    runtime.itemCount = 3;
    runtime.subtotalCents = 1575;
    const next = navigatorTree();
    expect(next.type).toBe(first.type);
    expect(next.key).toBeNull();
    const accessory = next.props.children[1];
    expect(accessory && accessory.props.children.props.summary.countLabel).toBe("3 items");
    expect(accessory && accessory.props.children.props.summary.subtotalLabel).toBe("$15.75");
    runtime.itemCount = 0;
    runtime.subtotalCents = 0;
    const empty = navigatorTree();
    expect(empty.props.minimizeBehavior).toBe("never");
    expect(empty.props.children[1]).toBeNull();
    expect(empty.type).toBe(first.type);
    expect(empty.key).toBeNull();
  });

  it.each([
    ["ios", "25.0"],
    ["android", "36"]
  ])("uses a regular fallback without unsupported native options on %s %s", (platform, version) => {
    Object.assign(runtime, { platform, version, itemCount: 2, subtotalCents: 1450 });
    expect(navigatorTree().props.minimizeBehavior).toBeUndefined();
    expect(navigatorTree().props.children[1]).toBeNull();
    const html = renderScreen();
    expect(html).toContain('data-safe-area="true"');
    expect(html).toContain("2 items");
    expect(html).toContain("$14.50");
    expect(html).toContain('data-content-bottom="24"');
  });

  it.each([true, false])("mounts tab content immediately, including before first focus (focused: %s)", (focused) => {
    runtime.focused = focused;
    expect(renderScreen()).toContain("Mounted content");
  });

  it("keeps inactive Android content mounted without displaying its fallback cart", () => {
    Object.assign(runtime, { platform: "android", version: "36", focused: false, itemCount: 2 });
    const html = renderScreen();
    expect(html).toContain("Mounted content");
    expect(html).not.toContain("2 items");
  });

  it("extends content behind the iOS bar without a per-screen floating cart", () => {
    runtime.itemCount = 2;
    const html = renderScreen();
    expect(html).toContain('data-content-bottom="107"');
    expect(html.match(/data-preserve-native-view="true"/g)).toHaveLength(2);
    expect(html).not.toContain("data-safe-area");
    expect(html).not.toContain("2 items");
    expect(getNativeTabContentBottomInset(83)).toBe(107);
    expect(getNativeTabContentBottomInset(0)).toBe(24);
  });
});
