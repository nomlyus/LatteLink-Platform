import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import ProfilePage from "../app/account/alerts";
import SettingsPage from "../app/account/settings";

vi.stubGlobal("React", React);
vi.mock("react", async (original) => ({
  ...await original<typeof React>(),
  useState: (initial: unknown) => [initial, vi.fn()], useEffect: vi.fn(), useRef: () => ({ current: null })
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn(), canGoBack: () => true }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
vi.mock("@gorhom/bottom-sheet", () => ({ default: "BottomSheet" }));
vi.mock("react-native", () => ({
  View: "View", Text: "Text", TextInput: "TextInput", TouchableOpacity: "TouchableOpacity", StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34 }) }));
vi.mock("@tanstack/react-query", () => ({ useMutation: () => ({ isPending: false }), useQueryClient: () => ({}) }));
vi.mock("../src/auth/session", () => ({ useAuthSession: () => ({ isAuthenticated: true }) }));
vi.mock("../src/auth/profile", () => ({ customerProfileQueryKey: ["profile"], useCustomerProfileQuery: () => ({ data: { email: "member@example.test" } }) }));
vi.mock("../src/api/client", () => ({ apiClient: {} }));
vi.mock("../src/cart/store", () => ({ useCart: () => ({ clear: vi.fn() }) }));
vi.mock("../src/legal/links", () => ({ resolvePrivacyPolicyUrl: () => "https://example.test/privacy" }));
vi.mock("../src/auth/recovery", () => ({ getSettingsRecoveryCopy: () => ({}) }));
vi.mock("../src/account/DeleteAccountSheet", () => ({ DeleteAccountSheet: "DeleteAccountSheet" }));
vi.mock("../src/account/SettingsRows", () => ({ SettingsActionRow: "SettingsActionRow", SettingsInfoRow: "SettingsInfoRow" }));
vi.mock("../src/menu/catalog", () => ({ useAppConfigQuery: () => ({}), resolveAppConfigData: () => undefined, isMobileLoyaltyVisible: () => true }));
vi.mock("../src/account/AccountFloatingHeader", () => ({ AccountFloatingHeader: "Header", ACCOUNT_HEADER_HEIGHT: 52 }));
vi.mock("../src/account/AccountGlassCard", () => ({ AccountGlassCard: "AccountGlassCard" }));
vi.mock("../src/cart/GlassActionPill", () => ({ GlassActionPill: "SaveButton" }));
vi.mock("../src/ui/keyboard", () => ({ runAfterKeyboardDismiss: vi.fn() }));
vi.mock("../src/account/ProfileSheets", () => ({ COUNTRY_CODES: [{ code: "+1" }], CountrySheet: "CountrySheet", DateSheet: "DateSheet", parsePhoneWithCode: vi.fn() }));
vi.mock("../src/ui/system", () => ({
  Button: "Button", Chip: "Chip", ScreenScroll: "Scroll", SectionLabel: "SectionLabel",
  uiPalette: { text: "#171513" }, uiTypography: {}
}));

describe("Profile concentric cards", () => {
  it("keeps the adaptive profile form and save action without an introduction card", () => {
    const page = ProfilePage({ presentation: "sheet", contentTopInset: 70 });
    const form = page.props.children[0].props.children;
    expect(form.type).toBe("AccountGlassCard");
    expect(form.props.style).toEqual({ marginTop: 14, gap: 0 });
    expect(page.props.children[0].props.contentInsetAdjustmentBehavior).toBe("never");
    expect(page.props.children[1].props.children[1].type).toBe("SaveButton");
  });
});

describe("Settings sections", () => {
  it("omits the introductory card while retaining the account actions and sheet insets", () => {
    const page = SettingsPage({ presentation: "sheet", contentTopInset: 70 });
    const scroll = page.props.children[0];
    expect(React.Children.toArray(scroll.props.children).some((child) => React.isValidElement(child) && child.type === "AccountGlassCard")).toBe(false);
    expect(scroll.props.contentInsetAdjustmentBehavior).toBe("never");
    expect(scroll.props.contentContainerStyle).toContainEqual({ paddingTop: 86 });
    const actions = scroll.props.children[3].props.children.props.children;
    expect(actions.map((action: React.ReactElement<{ label: string }>) => action.props.label)).toEqual(["Delete Account", "Sign Out"]);
    for (const section of scroll.props.children.slice(1)) {
      expect(section.props.style).toEqual({ marginTop: 14 });
      expect(section.props.children.type).toBe("AccountGlassCard");
      expect(section.props.children.props.style).toBeUndefined();
      expect(section.props.children.props.contentStyle).toEqual({ padding: 0 });
    }
  });
});
