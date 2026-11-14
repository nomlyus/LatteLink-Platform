import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ version: 3, configuration: 1, platform: "ios" }));
vi.stubGlobal("React", React);
vi.mock("expo", () => ({
  requireOptionalNativeModule: () => ({ supportsConcentricCorners: true, cornerConfigurationVersion: runtime.version, glassConfigurationVersion: runtime.configuration }),
  requireNativeView: () => "NativeConcentricView"
}));
vi.mock("react-native", () => ({
  Platform: { get OS() { return runtime.platform; } }, View: "View",
  StyleSheet: { create: (styles: unknown) => styles }
}));

describe("native concentric content corners", () => {
  beforeEach(() => { vi.resetModules(); Object.assign(runtime, { version: 3, configuration: 1, platform: "ios" }); });
  it("uses native concentric clipping without introducing glass into solid content", async () => {
    const { NativeCornerView } = await import("../src/ui/NativeCornerView");
    const surface = NativeCornerView({ children: "content", fallbackRadius: 14, style: { backgroundColor: "white" } });
    expect(surface.type).toBe("NativeConcentricView");
    expect(surface.props).toMatchObject({ material: "none", colorScheme: "auto", cornerMode: "concentric", children: "content" });
    expect(surface.props.style).toEqual([{ backgroundColor: "white" }, { overflow: "hidden" }]);
  });
  it.each(["android", "older-corner-api", "older-material-api"])("keeps content usable on %s", async (fallback) => {
    if (fallback === "android") runtime.platform = "android";
    if (fallback === "older-corner-api") runtime.version = 2;
    if (fallback === "older-material-api") runtime.configuration = 0;
    const { NativeCornerView } = await import("../src/ui/NativeCornerView");
    const surface = NativeCornerView({ children: "content", fallbackRadius: 14 });
    expect(surface.type).toBe("View");
    expect(surface.props.style).toContainEqual({ borderRadius: 14 });
    expect(surface.props.children).toBe("content");
  });
  it("uses the native fixed-radius mode when concentric sheet corners are too large for content", async () => {
    const { NativeCornerView } = await import("../src/ui/NativeCornerView");
    const surface = NativeCornerView({ children: "content", cornerMode: "fixed", fallbackRadius: 18 });
    expect(surface.props).toMatchObject({ cornerMode: "fixed", cornerRadius: 18, material: "none" });
  });
});
