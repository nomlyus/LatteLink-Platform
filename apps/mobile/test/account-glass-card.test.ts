import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ platform: "ios", installed: true, glass: true, version: 2, configurationVersion: 0, nativeView: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("expo", () => ({
  requireOptionalNativeModule: () => runtime.installed ? { supportsConcentricCorners: true, cornerConfigurationVersion: runtime.version, glassConfigurationVersion: runtime.configurationVersion } : null,
  requireNativeView: (module: string, view: string) => { runtime.nativeView(module, view); return "NativeGlass"; }
}));
vi.mock("react-native", () => ({
  View: "View", StyleSheet: { create: (styles: unknown) => styles, absoluteFill: { position: "absolute" } },
  Platform: { get OS() { return runtime.platform; } }
}));
vi.mock("../src/ui/glass", () => ({ canUseLiquidGlass: () => runtime.glass }));
vi.mock("../src/ui/system", () => ({ GlassCard: "GlassCard" }));

describe("shared native Account glass cards", () => {
  beforeEach(() => {
    Object.assign(runtime, { platform: "ios", installed: true, glass: true, version: 2, configurationVersion: 0 });
    vi.clearAllMocks();
    vi.resetModules();
  });
  it.each([true, false])("preserves navigation-group padding with native support %s", async (installed) => {
    runtime.installed = installed;
    const { AccountGlassCard } = await import("../src/account/AccountGlassCard");
    const contentStyle = { padding: 0 };
    const card = AccountGlassCard({ children: "Navigation rows", contentStyle });
    if (installed) {
      expect(card.props.children[0].type).toBe("NativeGlass");
      expect(card.props.children[1].props.style).toEqual([{ padding: 20 }, contentStyle]);
    } else {
      expect(card.props.contentStyle).toBe(contentStyle);
    }
  });
  it("uses native concentric glass without a fixed JS clipping radius", async () => {
    const { AccountGlassCard } = await import("../src/account/AccountGlassCard");
    const card = AccountGlassCard({ children: "Account and points" });
    expect(runtime.nativeView).toHaveBeenCalledWith("NomlyGlass", "ConcentricGlassView");
    expect(card.props.style).toBeUndefined();
    expect(card.props.children[0].type).toBe("NativeGlass");
    expect(card.props.children[0].props.pointerEvents).toBe("none");
    expect(card.props.children[0].props.minimumCornerRadius).toBe(32);
    expect(card.props.children[1].props.children).toBe("Account and points");
  });
  it("allows clear and dark independently on a capable binary", async () => {
    runtime.configurationVersion = 1;
    const { AccountGlassCard } = await import("../src/account/AccountGlassCard");
    const card = AccountGlassCard({ children: "Account", glass: { glassEffectStyle: "clear", colorScheme: "dark", cornerMode: "capsule", glassTintColor: "#134733" } });
    expect(card.props.children[0].props).toMatchObject({ glassEffectStyle: "clear", colorScheme: "dark", cornerMode: "capsule", glassTintColor: "#134733", minimumCornerRadius: 32 });
  });
  it("does not send unsupported configuration to an older installed binary", async () => {
    const { AccountGlassCard } = await import("../src/account/AccountGlassCard");
    const card = AccountGlassCard({ children: "Account", glass: { glassEffectStyle: "clear", colorScheme: "dark" } });
    expect(card.props.children[0].props).not.toHaveProperty("glassEffectStyle");
    expect(card.props.children[0].props.minimumCornerRadius).toBe(32);
  });
  it.each(["old-client", "first-native-build", "android", "older-ios"])("keeps a working glass-card fallback for %s", async (fallback) => {
    if (fallback === "old-client") runtime.installed = false;
    if (fallback === "first-native-build") runtime.version = 0;
    if (fallback === "android") runtime.platform = "android";
    if (fallback === "older-ios") runtime.glass = false;
    const { AccountGlassCard } = await import("../src/account/AccountGlassCard");
    const card = AccountGlassCard({ children: "Account and points" });
    expect(card.type).toBe("GlassCard");
    expect(card.props.children).toBe("Account and points");
  });
});
