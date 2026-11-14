import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { SettingsActionRow, SettingsInfoRow } from "../src/account/SettingsRows";

vi.stubGlobal("React", React);
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
vi.mock("expo-symbols", () => ({ SymbolView: "Symbol" }));
vi.mock("react-native", () => ({
  Pressable: "Pressable", View: "View", Text: "Text",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 0.5 }
}));
vi.mock("../src/ui/system", () => ({
  uiPalette: { text: "#171513", textSecondary: "#605B55", danger: "#B45B4F", textMuted: "#9B9389", border: "rgba(23,21,19,0.08)" },
  uiTypography: {}
}));

describe("grouped Settings rows", () => {
  it("shows leading icons and authoritative values without implying informational rows are buttons", () => {
    const row = SettingsInfoRow({ label: "Location", value: "Test store", icon: "location" });
    expect(row.type).toBe("View");
    const [icon, label, value] = row.props.children[0].props.children;
    expect(icon.props).toMatchObject({ name: "location" });
    expect(label.props.style).not.toHaveProperty("textTransform");
    expect(value.props.children).toBe("Test store");
    expect(row.props.children[1].props.style).toMatchObject({ marginLeft: 58, marginRight: 20, height: 0.5 });
  });

  it("keeps full-row actions, accessible disabled state and native-looking disclosures", () => {
    const onPress = vi.fn();
    const row = SettingsActionRow({ label: "Privacy Policy", icon: "shield-checkmark", onPress });
    expect(row.props.accessibilityRole).toBe("button");
    expect(row.props.accessibilityState).toEqual({ disabled: false });
    expect(row.props.children[0].props.children[2].props.name).toEqual({ ios: "chevron.right", android: "chevron_right" });
    row.props.onPress();
    expect(onPress).toHaveBeenCalledOnce();
    const disabled = SettingsActionRow({ label: "Privacy Policy", icon: "shield-checkmark", onPress, disabled: true });
    expect(disabled.props.disabled).toBe(true);
    expect(disabled.props.accessibilityState).toEqual({ disabled: true });
  });

  it("preserves destructive styling without performing the destructive operation", () => {
    const row = SettingsActionRow({ label: "Delete Account", icon: "trash", onPress: vi.fn(), tone: "danger" });
    expect(row.props.children[0].props.children[0].props.color).toBe("#B45B4F");
    expect(row.props.children[0].props.children[1].props.style).toContainEqual({ color: "#B45B4F" });
  });

  it("omits misleading disclosures and trailing separators for Sign Out", () => {
    const row = SettingsActionRow({ label: "Sign Out", icon: "log-out", onPress: vi.fn(), disclosure: false, isLast: true });
    expect(row.props.children[0].props.children[2]).toBeNull();
    expect(row.props.children[1]).toBeNull();
    expect(SettingsInfoRow({ label: "Loyalty", value: "Enabled", icon: "gift", isLast: true }).props.children[1]).toBeNull();
  });
});
