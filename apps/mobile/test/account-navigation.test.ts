import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountRoute from "../app/(tabs)/account/index";
import AccountSheetLayout from "../app/(tabs)/account/_layout";
import TabsLayout from "../app/(tabs)/_layout";
import CartSignInRoute from "../app/cart-sign-in";

const router = vi.hoisted(() => ({ canGoBack: vi.fn(() => true), back: vi.fn(), replace: vi.fn() }));
const auth = vi.hoisted(() => ({ isAuthenticated: true }));
vi.mock("../src/auth/session", () => ({ useAuthSession: () => auth }));
vi.stubGlobal("React", React);
vi.mock("expo-router", () => ({
  useRouter: () => router,
  Stack: Object.assign(() => null, { Screen: "StackScreen" })
}));
vi.mock("../src/screens/AccountScreen", () => ({ AccountScreen: "AccountScreen" }));
vi.mock("../src/account/AccountSheetSurface", () => ({ AccountSheetSurface: "AccountSheetSurface" }));
vi.mock("../src/account/AccountSheetNavigation", () => ({
  AccountSheetNavigation: "AccountSheetNavigation", AccountHeaderMeasurement: "AccountHeaderMeasurement"
}));

describe("Account outside the tab bar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.isAuthenticated = true;
    router.canGoBack.mockReturnValue(true);
  });
  it("renders the existing Account screen inside the sheet navigator", () => {
    const screen = AccountRoute().props.children[1];
    expect(screen.type).toBe("AccountScreen");
    expect(screen.props.presentation).toBe("sheet");
  });
  it("keeps subpage navigation inside one transparent native sheet surface", () => {
    const layout = AccountSheetLayout();
    expect(layout.type).toBe("AccountSheetSurface");
    expect(layout.props.children.type).toBe("AccountSheetNavigation");
    const stack = layout.props.children.props.children;
    expect(stack.props.screenOptions.contentStyle.backgroundColor).toBe("transparent");
    expect(stack.props.children.map((screen: React.ReactElement<{ name: string }>) => screen.props.name))
      .toEqual(["index", "details/rewards", "details/profile", "details/settings"]);
    expect(stack.props.screenOptions).toMatchObject({ headerShown: true, headerTransparent: true, headerBackButtonDisplayMode: "minimal" });
    expect(stack.props.screenOptions.scrollEdgeEffects).toEqual({ top: "soft" });
    expect(stack.props.screenOptions).not.toHaveProperty("headerLeft");
    expect(stack.props.children[0].props.options).toMatchObject({
      title: "", headerBackVisible: false, scrollEdgeEffects: { top: "hidden" }
    });
    expect(stack.props.children[0].props.options).not.toHaveProperty("headerShown");
    expect(stack.props.children.slice(1).map((screen: React.ReactElement<{ options: { title: string } }>) => screen.props.options.title))
      .toEqual(["Rewards", "Profile", "Settings"]);
  });
  it("returns to the previous screen without resetting selected tabs", () => {
    AccountRoute().props.children[1].props.onBack();
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });
  it("provides a Home fallback for direct links with no history", () => {
    router.canGoBack.mockReturnValue(false);
    AccountRoute().props.children[1].props.onBack();
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/(tabs)/(navigation)/home");
  });
  it("presents Account as an expandable native sheet above the existing tabs", () => {
    const screens: React.ReactElement<{ name: string; options?: object }>[] = TabsLayout().props.children;
    const account = screens.find((screen) => screen.props.name === "account");
    expect(account?.props.options).toMatchObject({
      presentation: "formSheet",
      sheetAllowedDetents: [0.65, 0.95],
      sheetInitialDetentIndex: 0,
      sheetGrabberVisible: true,
      gestureEnabled: true,
      contentStyle: { backgroundColor: "transparent" }
    });
    expect(account?.props.options).not.toHaveProperty("sheetCornerRadius");
  });

  it("keeps signed-out Account at one height without scroll expansion", () => {
    auth.isAuthenticated = false;
    const screens: React.ReactElement<{ name: string; options?: object }>[] = TabsLayout().props.children;
    const account = screens.find((screen) => screen.props.name === "account");
    expect(account?.props.options).toMatchObject({
      sheetAllowedDetents: [0.65],
      sheetInitialDetentIndex: 0,
      sheetExpandsWhenScrolledToEdge: false,
      gestureEnabled: true
    });
  });

  it("presents the same Account content above Cart without dismissing either route on mount", () => {
    auth.isAuthenticated = false;
    const sheet = CartSignInRoute();
    expect(sheet.type).toBe("AccountSheetSurface");
    const [configuration, screen] = sheet.props.children;
    expect(configuration.props.options).toMatchObject({
      presentation: "formSheet", sheetAllowedDetents: [0.65], sheetExpandsWhenScrolledToEdge: false
    });
    expect(screen.type).toBe("AccountScreen");
    expect(screen.props.presentation).toBe("sheet");
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    screen.props.onBack();
    expect(router.back).toHaveBeenCalledOnce();
  });

  it("presents Orders as a dismissible partial-height native sheet rather than a full-screen push", () => {
    const screens: React.ReactElement<{ name: string; options?: object }>[] = TabsLayout().props.children;
    const orders = screens.find((screen) => screen.props.name === "orders");
    expect(orders?.props.options).toMatchObject({
      presentation: "formSheet",
      sheetAllowedDetents: [1],
      sheetInitialDetentIndex: 0,
      sheetGrabberVisible: true,
      sheetExpandsWhenScrolledToEdge: true,
      gestureEnabled: true,
      contentStyle: { backgroundColor: "transparent" }
    });
    expect(orders?.props.options).not.toHaveProperty("animation", "none");
    expect(orders?.props.options).not.toHaveProperty("sheetCornerRadius");
  });
});
