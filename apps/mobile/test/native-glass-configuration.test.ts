import { describe, expect, it } from "vitest";
import { nativeGlassProps } from "../src/ui/nativeGlassConfiguration";

describe("native glass configuration", () => {
  it("preserves current geometry and nonanimated defaults", () => {
    expect(nativeGlassProps()).toEqual({ colorScheme: "auto", minimumCornerRadius: 32, cornerRadius: 32, animationDuration: 0 });
  });
  it("exposes independent material, appearance, tint and corner settings", () => {
    const configuration = { glassEffectStyle: "clear", colorScheme: "dark", material: "glass", blurStyle: "thin", glassTintColor: "#134733", isInteractive: true, cornerMode: "capsule" } as const;
    expect(nativeGlassProps(configuration)).toMatchObject(configuration);
  });
  it("does not send invalid dimensions or unbounded animations to UIKit", () => {
    expect(nativeGlassProps({ minimumCornerRadius: 0, cornerRadius: NaN, animationDuration: Infinity })).toEqual({ colorScheme: "auto", minimumCornerRadius: 32, cornerRadius: 32, animationDuration: 0 });
    expect(nativeGlassProps({ cornerRadius: 0, animationDuration: 10 }).animationDuration).toBe(5);
  });
});
