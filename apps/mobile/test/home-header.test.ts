import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { homeHeaderOptions } from "../src/home/homeHeaderOptions";
import { accountHeaderOptions } from "../src/navigation/accountHeaderOptions";

vi.stubGlobal("React", React);
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
vi.mock("react-native", () => ({
  Pressable: "Pressable",
  View: "View",
  StyleSheet: { create: (styles: unknown) => styles }
}));

describe("Home native header controls", () => {
  it("groups the bell and enabled Orders button while leaving Account separate", () => {
    const account = accountHeaderOptions(vi.fn()).unstable_headerRightItems()[0];
    const openOrders = vi.fn();
    const buttons = homeHeaderOptions(openOrders).unstable_headerLeftItems();
    expect(buttons.map((button) => button.icon.name)).toEqual(["bell", "list.bullet.rectangle"]);
    expect(buttons.map((button) => button.disabled)).toEqual([true, false]);
    buttons[1].onPress();
    expect(openOrders).toHaveBeenCalledOnce();
    expect(account.sharesBackground).toBe(false);
    expect(account.variant).toBe("prominent");
    for (const button of buttons) {
      expect(button.type).toBe(account.type);
      expect(button.tintColor).toBe(account.tintColor);
      expect(button.sharesBackground).toBe(true);
      expect(button).not.toHaveProperty("width");
    }
  });

  it("retains accessible, equally sized fallback controls without inventing actions", () => {
    const children: React.ReactElement<{ accessibilityLabel: string; style: object; disabled: boolean }>[] =
      homeHeaderOptions(vi.fn()).headerLeft().props.children;
    expect(children.map((child) => child.props.accessibilityLabel)).toEqual(["Open notifications", "Open orders"]);
    expect(children.map((child) => child.props.disabled)).toEqual([true, false]);
    for (const child of children) {
      expect(child.props.style).toMatchObject({ width: 44, height: 44 });
    }
  });
});
