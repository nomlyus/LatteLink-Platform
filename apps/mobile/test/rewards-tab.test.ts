import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import RewardsRoute from "../app/(tabs)/(navigation)/rewards/index";
import RewardsLayout from "../app/(tabs)/(navigation)/rewards/_layout";
import { bottomTabs } from "../src/navigation/bottomTabs";

vi.stubGlobal("React", React);
vi.mock("expo-router", () => ({ Stack: "Stack", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("expo-router/react-navigation", () => ({ useHeaderHeight: () => 110 }));
vi.mock("../src/navigation/TabScreen", () => ({ TabScreen: "TabScreen" }));
vi.mock("../app/account/rewards", () => ({ default: "ExistingRewardsPage" }));
vi.mock("../src/navigation/nativeAppleHeader", () => ({
  nativeAppleHeaderCapabilities: () => ({ available: true, nativeBarMinimization: true }),
  inlineScrollingHeaderConfiguration: () => ({ largeTitleDisplayMode: "inline" })
}));
vi.mock("react-native", () => ({ View: "View", Pressable: "Pressable", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));

describe("Rewards primary destination", () => {
  it("leaves the tab content empty while preserving its native header", () => {
    const route = RewardsRoute();
    expect(route.type).toBe("TabScreen");
    expect(route.props.children.type).toBe("View");
    expect(route.props.children.props.children).toBeUndefined();
    expect(RewardsLayout().props.screenOptions).toMatchObject({ title: "Rewards", headerShown: true, headerTransparent: true });
  });
  it("replaces only History with the gift destination and keeps Search rightmost", () => {
    expect(bottomTabs.map((tab) => tab.name)).toEqual(["home", "menu", "rewards", "search"]);
    expect(bottomTabs[2].nativeIcon.sf.default).toBe("gift");
  });
});
