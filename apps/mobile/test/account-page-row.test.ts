import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { AccountPageRow } from "../src/account/AccountPrimitives";

vi.stubGlobal("React", React);
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
vi.mock("expo-symbols", () => ({ SymbolView: "Symbol" }));
vi.mock("react-native", () => ({
  Pressable: "Pressable", Text: "Text", View: "View",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 0.5 }
}));
vi.mock("../src/ui/system", () => ({
  uiPalette: { text: "#171513", textSecondary: "#605B55", border: "rgba(23,21,19,0.08)" },
  uiTypography: { displayFamily: undefined }
}));

describe("grouped Account navigation rows", () => {
  it("keeps the full row accessible and preserves its destination callback", () => {
    const openSettings = vi.fn();
    const row = AccountPageRow({ label: "Settings", icon: "settings", onPress: openSettings });
    expect(row.props.accessibilityRole).toBe("button");
    expect(row.props.accessibilityLabel).toBe("Settings");
    expect(row.props.style({ pressed: false })[0].minHeight).toBeGreaterThanOrEqual(44);
    row.props.onPress();
    expect(openSettings).toHaveBeenCalledOnce();
  });

  it("uses a leading icon, sentence-case label and trailing disclosure chevron", () => {
    const row = AccountPageRow({ label: "Rewards activity", icon: "gift", onPress: vi.fn() });
    const [icon, label, chevron] = row.props.children[0].props.children;
    expect(icon.props).toMatchObject({ name: "gift" });
    expect(label.props.children).toBe("Rewards activity");
    expect(label.props.style).not.toHaveProperty("textTransform");
    expect(chevron.props).toMatchObject({ name: { ios: "chevron.right", android: "chevron_right" }, accessible: false });
    expect(row.props.children[1].props.style).toMatchObject({ marginLeft: 58, marginRight: 20, height: 0.5 });
  });

  it("omits the divider after the last row", () => {
    const row = AccountPageRow({ label: "Settings", icon: "settings", isLast: true, onPress: vi.fn() });
    expect(row.props.children[1]).toBeNull();
  });
});
