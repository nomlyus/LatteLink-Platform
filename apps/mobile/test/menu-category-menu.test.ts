import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { MenuCategoryMenu, categoryMenuItem } from "../src/menu/MenuCategoryMenu";
import { uiPalette } from "../src/ui/systemColors";

const runtime = vi.hoisted(() => ({ platform: "ios", push: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("expo-router", () => ({ Stack: { Screen: "NativeHeaderOptions" }, useRouter: () => ({ push: runtime.push }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
vi.mock("react-native", () => ({
  Platform: { get OS() { return runtime.platform; } },
  Pressable: "Pressable", StyleSheet: { create: (styles: unknown) => styles }
}));

const categories = [{ id: "coffee", label: "Coffee" }, { id: "tea", label: "Tea" }];

describe("native Menu category menu", () => {
  it("uses a native selection menu with current catalog labels and a checkmark", () => {
    const select = vi.fn();
    const item = categoryMenuItem(categories, "tea", select);
    expect(item).toMatchObject({ type: "menu", label: "Categories", tintColor: uiPalette.accent, sharesBackground: false });
    expect(item).not.toHaveProperty("icon");
    expect(item.menu.multiselectable).toBe(false);
    expect(item.menu.items.map((action) => action.label)).toEqual(["Coffee", "Tea"]);
    expect(item.menu.items.map((action) => action.type === "action" ? action.state : null)).toEqual(["off", "on"]);
    const action = item.menu.items[0];
    if (action.type !== "action") throw new Error("Expected a native action");
    action.onPress();
    expect(select).toHaveBeenCalledWith("coffee");
  });

  it("adds the native control beside Account without replacing the Account destination", () => {
    runtime.platform = "ios";
    const screen = MenuCategoryMenu({ categories, selectedId: "coffee", onSelect: vi.fn() });
    expect(screen?.type).toBe("NativeHeaderOptions");
    const items = screen?.props.options.unstable_headerRightItems();
    expect(items?.map((item: { type: string }) => item.type)).toEqual(["menu", "button"]);
    items?.[1].onPress();
    expect(runtime.push).toHaveBeenCalledWith("/(tabs)/account");
  });

  it("removes stale categories while loading or unavailable, retaining Account", () => {
    runtime.platform = "ios";
    const screen = MenuCategoryMenu({ categories: [], selectedId: null, onSelect: vi.fn() });
    expect(screen?.props.options.unstable_headerRightItems()).toHaveLength(1);
  });

  it("does not send UIKit menu options to Android", () => {
    runtime.platform = "android";
    expect(MenuCategoryMenu({ categories, selectedId: null, onSelect: vi.fn() })).toBeNull();
  });
});
