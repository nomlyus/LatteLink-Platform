import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountSheetSurface } from "../src/account/AccountSheetSurface";

const runtime = vi.hoisted(() => ({
  reduced: false,
  platform: "ios",
  glass: true,
  setReduced: vi.fn(),
  effect: undefined as undefined | (() => () => void),
  onChange: undefined as undefined | ((enabled: boolean) => void),
  remove: vi.fn(),
  readSetting: vi.fn<() => Promise<boolean>>()
}));
vi.stubGlobal("React", React);
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: () => [runtime.reduced, runtime.setReduced],
  useEffect: (effect: () => () => void) => { runtime.effect = effect; }
}));
vi.mock("react-native", () => ({
  View: "View",
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: { position: "absolute" } },
  Platform: { get OS() { return runtime.platform; } },
  AccessibilityInfo: {
    isReduceTransparencyEnabled: () => runtime.readSetting(),
    addEventListener: (_event: string, callback: (enabled: boolean) => void) => {
      runtime.onChange = callback;
      return { remove: runtime.remove };
    }
  }
}));
vi.mock("expo-glass-effect", () => ({ GlassView: "GlassView" }));
vi.mock("expo-blur", () => ({ BlurView: "BlurView" }));
vi.mock("../src/ui/glass", () => ({ canUseLiquidGlass: () => runtime.glass }));
vi.mock("../src/ui/system", () => ({ uiPalette: { surfaceStrong: "#FFFDF8" } }));

describe("Account sheet material", () => {
  beforeEach(() => {
    Object.assign(runtime, { reduced: false, glass: true, platform: "ios" });
    vi.clearAllMocks();
    runtime.readSetting.mockResolvedValue(false);
  });

  it("uses a noninteractive native glass background without covering Account content", () => {
    const sheet = AccountSheetSurface({ children: "Account content" });
    const background = sheet.props.children[0];
    expect(sheet.props.accessibilityViewIsModal).toBe(true);
    expect(background.type).toBe("GlassView");
    expect(background.props).toMatchObject({ glassEffectStyle: "regular", colorScheme: "auto", pointerEvents: "none" });
    expect(sheet.props.children[1]).toBe("Account content");
  });

  it("uses blur on older iOS and an opaque native sheet surface on Android", () => {
    runtime.glass = false;
    expect(AccountSheetSurface({ children: null }).props.children[0].type).toBe("BlurView");
    runtime.platform = "android";
    expect(AccountSheetSurface({ children: null }).props.children[0].type).toBe("View");
  });

  it("uses an opaque fallback with Reduce Transparency enabled", () => {
    runtime.reduced = true;
    const background = AccountSheetSurface({ children: null }).props.children[0];
    expect(background.type).toBe("View");
    expect(background.props.style).toContainEqual({ backgroundColor: "#FFFDF8" });
  });

  it("reads accessibility preferences and removes its subscription on dismissal", async () => {
    AccountSheetSurface({ children: null });
    const dispose = runtime.effect?.();
    await Promise.resolve();
    expect(runtime.setReduced).toHaveBeenCalledWith(false);
    runtime.onChange?.(true);
    expect(runtime.setReduced).toHaveBeenLastCalledWith(true);
    dispose?.();
    expect(runtime.remove).toHaveBeenCalledTimes(1);
    runtime.setReduced.mockClear();
    runtime.onChange?.(false);
    expect(runtime.setReduced).not.toHaveBeenCalled();
  });

  it("ignores preference results that arrive after dismissal or a newer event", async () => {
    let resolve: (value: boolean) => void = () => {};
    runtime.readSetting.mockReturnValue(new Promise<boolean>((complete) => { resolve = complete; }));
    AccountSheetSurface({ children: null });
    const dispose = runtime.effect?.();
    runtime.onChange?.(true);
    resolve(false);
    await Promise.resolve();
    expect(runtime.setReduced).toHaveBeenCalledTimes(1);
    expect(runtime.setReduced).toHaveBeenCalledWith(true);
    dispose?.();
  });
});
