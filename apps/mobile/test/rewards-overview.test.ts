import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { RewardsOverview } from "../src/account/RewardsOverview";
import { previewRewardsBalance, previewRewardsEntries } from "../src/dev/designPreviews";

vi.stubGlobal("React", React);
vi.mock("react-native", () => ({ View: "View", Text: "Text", ActivityIndicator: "Spinner", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("../src/ui/system", () => ({ Button: "Button", uiPalette: {} }));
vi.mock("../src/account/AccountGlassCard", () => ({ AccountGlassCard: "Glass" }));
vi.mock("../src/account/RewardActivityRow", () => ({ RewardActivityRow: "Activity" }));
function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
const ready = { enabled: true, balance: previewRewardsBalance, entries: previewRewardsEntries, balanceState: "ready", activityState: "ready", onRetry: vi.fn() } as const;
describe("rewards presentation", () => {
  it("uses authoritative balances, including a legitimate zero", () => {
    expect(text(RewardsOverview(ready))).toContain("240");
    expect(text(RewardsOverview({ ...ready, balance: { ...previewRewardsBalance, availablePoints: 0 } }))).toContain("0");
  });
  it("doesn't show cached points or an empty activity claim after failures", () => {
    const result = RewardsOverview({ ...ready, balanceState: "error", activityState: "error" });
    expect(text(result)).toContain("Unavailable");
    expect(text(result)).not.toContain("240");
    expect(text(result)).not.toContain("Points from your visits will appear here.");
    expect(text(result)).toContain("activity is temporarily unavailable");
  });
  it("distinguishes activity loading from an empty successful response", () => {
    expect(text(RewardsOverview({ ...ready, activityState: "loading" }))).not.toContain("Points from your visits");
    expect(text(RewardsOverview({ ...ready, entries: [] }))).toContain("Points from your visits");
  });
});
