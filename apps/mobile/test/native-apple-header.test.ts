import { beforeEach, describe, expect, it, vi } from "vitest";
import { inlineScrollingHeaderConfiguration, nativeAppleHeaderCapabilities } from "../src/navigation/nativeAppleHeader";

const runtime = vi.hoisted(() => ({ platform: "ios", installed: true, version: 1, minimization: true }));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => runtime.installed ? { nativeHeaderConfigurationVersion: runtime.version, supportsNativeBarMinimization: runtime.minimization } : null }));
vi.mock("react-native", () => ({ Platform: { get OS() { return runtime.platform; } } }));

describe("single-stack native Apple header", () => {
  beforeEach(() => Object.assign(runtime, { platform: "ios", installed: true, version: 1, minimization: true }));
  it("requires the linked Screens extension, not just the presence of Expo UI", () => {
    expect(nativeAppleHeaderCapabilities()).toEqual({ available: true, nativeBarMinimization: true });
    runtime.version = 0;
    expect(nativeAppleHeaderCapabilities()).toEqual({ available: false, nativeBarMinimization: false });
    runtime.installed = false;
    expect(nativeAppleHeaderCapabilities().available).toBe(false);
  });
  it.each(["android", "web"])("does not apply UIKit props on %s", (platform) => {
    runtime.platform = platform;
    expect(nativeAppleHeaderCapabilities()).toEqual({ available: false, nativeBarMinimization: false });
  });
  it("uses iOS 27 whole-bar minimization without a competing swipe recognizer", () => {
    expect(inlineScrollingHeaderConfiguration(true)).toEqual({
      largeTitleDisplayMode: "inline", navigationItemStyle: "navigator",
      navigationBarMinimizationBehavior: "onScrollDown", navigationBarRestorationBehavior: "automatic", navigationBarSafeAreaAdjustment: "automatic",
      hidesBarsOnSwipe: false, hidesBarsOnTap: false, hidesBarsWhenKeyboardAppears: false, hidesBarsWhenVerticallyCompact: false
    });
  });
  it("uses UIKit's existing swipe-hide mechanism on older supported iOS", () => {
    runtime.minimization = false;
    expect(nativeAppleHeaderCapabilities()).toEqual({ available: true, nativeBarMinimization: false });
    expect(inlineScrollingHeaderConfiguration(false)).toMatchObject({ largeTitleDisplayMode: "inline", navigationBarMinimizationBehavior: "inherit", hidesBarsOnSwipe: true });
  });
});
