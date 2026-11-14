import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountScreen } from "../src/screens/AccountScreen";
import RewardsPage from "../app/account/rewards";
import { RewardsOverview } from "../src/account/RewardsOverview";

const runtime = vi.hoisted(() => ({ authenticated: true, bottomInset: 34, platform: "ios", version: "26.0", push: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("expo-router", () => ({ useRouter: () => ({ push: runtime.push }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { name: "Member" } }) }));
vi.mock("react-native", () => ({
  View: "View", Text: "Text", Pressable: "Pressable", StyleSheet: { create: (styles: unknown) => styles },
  Platform: { get OS() { return runtime.platform; }, get Version() { return runtime.version; } }
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: runtime.bottomInset }) }));
vi.mock("../src/auth/session", () => ({ useAuthSession: () => ({ isAuthenticated: runtime.authenticated }) }));
vi.mock("../src/navigation/nativeAppleHeader", () => ({ nativeAppleHeaderCapabilities: () => ({ available: true }) }));
vi.mock("../src/navigation/useNativeScrollEdge", () => ({ useNativeScrollEdge: () => vi.fn() }));
vi.mock("../src/auth/profile", () => ({ customerProfileQueryKey: ["profile"] }));
vi.mock("../src/auth/useAppleSignIn", () => ({ useAppleSignIn: () => ({ available: true, signIn: vi.fn() }) }));
vi.mock("../src/account/useAccountSignInCompletion", () => ({ useAccountSignInCompletion: vi.fn() }));
vi.mock("../src/account/AccountAppleSignIn", () => ({ AccountAppleSignIn: "AppleSignIn" }));
vi.mock("../src/account/AccountGlassCard", () => ({ AccountGlassCard: "AccountGlassCard" }));
vi.mock("../src/auth/recovery", () => ({
  getAccountRecoveryCopy: (_state: unknown, brand: string) => ({ title: "Welcome", body: `Sign in to your account at ${brand}.`, actionLabel: "Sign in" })
}));
vi.mock("../src/api/client", () => ({ apiClient: { me: vi.fn() } }));
vi.mock("../src/account/data", () => ({
  useLoyaltyBalanceQuery: () => ({ data: { availablePoints: 25, pendingPoints: 0, lifetimeEarned: 30 } }),
  useLoyaltyLedgerQuery: () => ({}),
  getLoyaltyQueryErrorMessage: () => "Unavailable"
}));
vi.mock("../src/menu/catalog", () => ({
  useAppConfigQuery: () => ({ data: {}, refetch: vi.fn() }),
  resolveAppConfigData: () => ({ header: { background: "#134733", foreground: "#FFFFFF" }, brand: { brandName: "Rawaq Coffee", locationName: "Ann Arbor, MI" } }),
  isMobileLoyaltyVisible: () => true
}));
vi.mock("../src/navigation/tabContentLayout", () => ({ useTabContentLayout: () => undefined }));
vi.mock("../src/navigation/tabBarMetrics", () => ({ TAB_BAR_HEIGHT: 70, getTabBarBottomOffset: () => 10 }));
vi.mock("../src/account/AccountFloatingHeader", () => ({ AccountFloatingHeader: "AccountHeader", ACCOUNT_HEADER_HEIGHT: 52 }));
vi.mock("../src/account/AccountPrimitives", () => ({ AccountPageRow: "AccountRow" }));
vi.mock("../src/account/RewardActivityRow", () => ({ RewardActivityRow: "RewardActivityRow" }));
vi.mock("../src/ui/system", () => ({
  Button: "Button", Chip: "Chip", Card: "Card", GlassCard: "GlassCard", ScreenScroll: "ScreenScroll", ScreenStatic: "ScreenStatic", SectionLabel: "SectionLabel",
  uiPalette: { text: "#171513", background: "#F7F4ED" }, uiTypography: {}
}));

type NodeProps = { children?: React.ReactNode; label?: string; onPress?: () => void; onAlternativeSignIn?: () => void; signIn?: { available: boolean } };
function findNodes(node: React.ReactNode, type: string): React.ReactElement<NodeProps>[] {
  return React.Children.toArray(node).flatMap((child) => {
    if (!React.isValidElement<NodeProps>(child)) return [];
    return [...(child.type === type ? [child] : []), ...findNodes(child.props.children, type)];
  });
}

describe("Account sheet content compatibility", () => {
  it("uses the brand rather than the selected location in the signed-out subtitle", () => {
    runtime.authenticated = false;
    const text = findNodes(AccountScreen({ presentation: "sheet" }), "Text").map((node) => node.props.children).join(" ");
    expect(text).toContain("at Rawaq Coffee.");
    expect(text).not.toContain("Ann Arbor");
  });
  beforeEach(() => {
    Object.assign(runtime, { authenticated: true, bottomInset: 34, platform: "ios", version: "26.0" });
    vi.clearAllMocks();
  });

  it.each([true, false])("reuses rewards in the primary tab without a floating header (authenticated: %s)", (authenticated) => {
    runtime.authenticated = authenticated;
    const tab = RewardsPage({ presentation: "tab", contentTopInset: 110 });
    const scroll = tab.props.children[0];
    expect(scroll.props.contentContainerStyle).toContainEqual({ paddingTop: 126 });
    expect(scroll.props.onLayout).toBeTypeOf("function");
    expect(tab.props.children[1]).toBeNull();
    if (!authenticated) {
      const signIn = findNodes(tab, "Button").find((button) => button.props.label === "Sign In");
      signIn?.props.onPress?.();
      expect(runtime.push).toHaveBeenCalledWith({ pathname: "/auth", params: { returnTo: "/(tabs)/(navigation)/rewards" } });
    }
  });

  it.each([true, false])("leaves sheet positioning to its native header (authenticated: %s)", (authenticated) => {
    runtime.authenticated = authenticated;
    const sheet = RewardsPage({ presentation: "sheet", contentTopInset: 70 });
    const scroll = sheet.props.children[0];
    expect(scroll.props.contentInsetAdjustmentBehavior).toBe("never");
    expect(scroll.props.contentContainerStyle).toContainEqual({ paddingTop: 86 });
    expect(sheet.props.children[1]).toBeNull();
    const fullScreen = RewardsPage();
    expect(fullScreen.props.children[0].props.contentInsetAdjustmentBehavior).toBeUndefined();
  });

  it("keeps sheet content transparent, readable and clear of the drag handle", () => {
    const sheet = AccountScreen({ presentation: "sheet" });
    expect(sheet.props.children[0].props).toMatchObject({ transparent: true, bottomInset: 24 });
    expect(sheet.props.children[1]).toBeNull();
    expect(sheet.props.children[0].props.contentContainerStyle).toContainEqual({ paddingTop: 20 });
    const links = findNodes(sheet, "AccountRow");
    expect(links.map((link) => link.props.label)).toEqual(["Rewards activity", "Profile", "Settings"]);
    expect(findNodes(sheet, "GlassCard")).toHaveLength(0);
    expect(findNodes(sheet, "AccountGlassCard")).toHaveLength(2);
    links[0].props.onPress?.();
    expect(runtime.push).toHaveBeenCalledWith("/(tabs)/account/details/rewards");
    links[1].props.onPress?.();
    expect(runtime.push).toHaveBeenCalledWith("/(tabs)/account/details/profile");
    links[2].props.onPress?.();
    expect(runtime.push).toHaveBeenCalledWith("/(tabs)/account/details/settings");
  });

  it("shows loyalty points without exposing the feature configuration badge", () => {
    const sheet = AccountScreen({ presentation: "sheet" });
    expect(findNodes(sheet, "Chip")).toHaveLength(0);
    expect(findNodes(sheet, "Text").map((node) => node.props.children)).toContain("25");
    expect(findNodes(sheet, "Text").map((node) => node.props.children)).toContain("Lifetime 30 pts");
  });

  it("uses the shared concentric glass surface for both Rewards cards", () => {
    const rewards = RewardsPage({ presentation: "sheet", contentTopInset: 70 });
    const overview = rewards.props.children[0].props.children;
    expect(overview.type).toBe(RewardsOverview);
    const content = RewardsOverview(overview.props);
    expect(findNodes(content, "AccountGlassCard")).toHaveLength(2);
    expect(findNodes(content, "GlassCard")).toHaveLength(0);
    expect(findNodes(content, "Card")).toHaveLength(0);
    expect(findNodes(content, "Text").map((node) => node.props.children)).toContain("25");
  });

  it("does not show a diagnostic action below the account links", () => {
    const sheet = AccountScreen({ presentation: "sheet" });
    expect(findNodes(sheet, "Pressable")).toHaveLength(0);
    expect(findNodes(sheet, "AccountRow")).toHaveLength(3);
  });

  it("does not attach pull-to-refresh to Account content", () => {
    const sheet = AccountScreen({ presentation: "sheet" });
    expect(sheet.props.children[0].props).not.toHaveProperty("onRefresh");
    expect(sheet.props.children[0].props).not.toHaveProperty("refreshing");
  });

  it("offers Apple sign-in directly, retaining the Account return for unsupported platforms", () => {
    runtime.authenticated = false;
    const sheet = AccountScreen({ presentation: "sheet" });
    expect(sheet.props.children[0].props.transparent).toBe(true);
    expect(sheet.props.children[1]).toBeNull();
    expect(findNodes(sheet, "AppleSignIn")[0].props.signIn?.available).toBe(true);
    expect(runtime.push).not.toHaveBeenCalled();
    findNodes(sheet, "AppleSignIn")[0].props.onAlternativeSignIn?.();
    expect(runtime.push).toHaveBeenCalledWith({ pathname: "/auth", params: { returnTo: "/(tabs)/account" } });
  });

  it("does not change the existing full-screen presentation defaults", () => {
    const screen = AccountScreen();
    expect(screen.props.children[0].props.transparent).toBe(false);
    expect(screen.props.children[1].props).toMatchObject({ insetTop: 59, backgroundColor: "#134733" });
  });

  it.each([[34, 20], [0, 20]])("avoids extra bottom safe-area padding in the floating iOS sheet (%s)", (bottomInset, paddingBottom) => {
    runtime.authenticated = false;
    runtime.bottomInset = bottomInset;
    const sheet = AccountScreen({ presentation: "sheet" });
    expect(sheet.props.children[0].props.style).toContainEqual({ paddingTop: 20, paddingBottom });
  });

  it.each([["android", "36"], ["ios", "18.0"]])("retains safe-area spacing on %s %s", (platform, version) => {
    Object.assign(runtime, { authenticated: false, platform, version });
    const sheet = AccountScreen({ presentation: "sheet" });
    expect(sheet.props.children[0].props.style).toContainEqual({ paddingTop: 20, paddingBottom: 34 });
  });
});
