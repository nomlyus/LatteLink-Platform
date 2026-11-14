import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { RewardActivityRow } from "../src/account/RewardActivityRow";
import type { LoyaltyLedgerEntry } from "../src/account/data";

vi.stubGlobal("React", React);
vi.mock("react-native", () => ({ View: "View", Text: "Text", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("../src/ui/system", () => ({
  uiPalette: { text: "#171513", textSecondary: "#605B55", accentSoft: "rgba(30,27,24,0.06)", danger: "#B45B4F", border: "rgba(23,21,19,0.08)" },
  uiTypography: {}
}));

describe("Rewards activity label contrast", () => {
  it.each([
    ["EARN", 25, "Earned"], ["REDEEM", -25, "Redeemed"],
    ["REFUND", -25, "Returned"], ["ADJUSTMENT", 0, "Adjusted"]
  ] as const)("keeps %s readable without an interactive white-text chip", (type, points, label) => {
    const entry: LoyaltyLedgerEntry = { id: "entry", brandId: "brand", userId: "customer", locationId: "location", type, points, createdAt: "2026-10-19T12:00:00Z" };
    const row = RewardActivityRow({ entry, showDivider: false });
    const badge = row.props.children[0].props.children[0];
    expect(badge.type).toBe("View");
    expect(badge.props.accessibilityRole).toBeUndefined();
    expect(badge.props.children.props.children).toBe(label);
    expect(badge.props.children.props.style.color).toBe("#171513");
    expect(row.props.children[1].props.children[0].props.children).toBe(`${points > 0 ? "+" : ""}${points} pts`);
  });
});
