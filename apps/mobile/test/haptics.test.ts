import { beforeEach, describe, expect, it, vi } from "vitest";
import { hapticFeedback } from "../src/ui/haptics";

const runtime = vi.hoisted(() => ({
  platform: "ios", installed: true, selection: vi.fn(), impact: vi.fn(), notification: vi.fn(), android: vi.fn()
}));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => runtime.installed ? {} : null }));
vi.mock("react-native", () => ({ Platform: { get OS() { return runtime.platform; } } }));
vi.mock("expo-haptics", () => ({
  selectionAsync: runtime.selection, impactAsync: runtime.impact, notificationAsync: runtime.notification,
  performAndroidHapticsAsync: runtime.android, ImpactFeedbackStyle: { Soft: "soft" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  AndroidHaptics: { Segment_Tick: "tick", Context_Click: "click", Confirm: "confirm", Reject: "reject" }
}));

describe("optional haptic feedback", () => {
  beforeEach(() => {
    Object.assign(runtime, { platform: "ios", installed: true });
    vi.resetAllMocks();
  });
  it("does not produce feedback until explicitly invoked", () => {
    expect(runtime.selection).not.toHaveBeenCalled();
    expect(runtime.impact).not.toHaveBeenCalled();
    expect(runtime.notification).not.toHaveBeenCalled();
  });
  it("maps selection, soft impact and notifications to native iOS feedback", async () => {
    await hapticFeedback("selection");
    await hapticFeedback("impact");
    await hapticFeedback("success");
    await hapticFeedback("warning");
    await hapticFeedback("error");
    expect(runtime.selection).toHaveBeenCalledTimes(1);
    expect(runtime.impact).toHaveBeenCalledWith("soft");
    expect(runtime.notification.mock.calls).toEqual([["success"], ["warning"], ["error"]]);
  });
  it("uses Android's native feedback constants rather than manual vibration patterns", async () => {
    runtime.platform = "android";
    for (const kind of ["selection", "impact", "success", "warning", "error"] as const) await hapticFeedback(kind);
    expect(runtime.android.mock.calls).toEqual([["tick"], ["click"], ["confirm"], ["reject"], ["reject"]]);
    expect(runtime.selection).not.toHaveBeenCalled();
  });
  it("does nothing on old clients without the module, or on web", async () => {
    runtime.installed = false;
    await hapticFeedback("selection");
    runtime.installed = true;
    runtime.platform = "web";
    await hapticFeedback("selection");
    expect(runtime.selection).not.toHaveBeenCalled();
  });
  it("never propagates a failed haptic into the business interaction", async () => {
    runtime.selection.mockRejectedValue(new Error("Not available"));
    await expect(hapticFeedback("selection")).resolves.toBeUndefined();
  });
});
