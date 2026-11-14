import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";

const patch = readFileSync(new URL("../../../patches/react-native-screens@4.30.0.patch", import.meta.url), "utf8");
describe("pinned native header bridge extension (source contract, not native compilation)", () => {
  it("normalizes transparent standard backgrounds and sets the compact scroll-edge appearance", () => {
    expect(patch).toContain("CGColorGetAlpha(config.backgroundColor.CGColor) == 0. ? nil : config.backgroundColor");
    expect(patch).toContain("navitem.compactScrollEdgeAppearance = scrollEdgeAppearance;");
  });
  it("extends codegen, public types and native implementation together", () => {
    for (const file of ["src/fabric/ScreenStackHeaderConfigNativeComponent.ts", "src/types.tsx", "lib/typescript/types.d.ts", "ios/RNSScreenStackHeaderConfig.h", "ios/RNSScreenStackHeaderConfig.mm"]) expect(patch).toContain(file);
    for (const prop of ["largeTitleDisplayMode", "navigationItemStyle", "navigationBarMinimizationBehavior", "navigationBarRestorationBehavior", "navigationBarSafeAreaAdjustment", "hidesBarsOnSwipe", "hidesBarsOnTap", "hidesBarsWhenKeyboardAppears", "hidesBarsWhenVerticallyCompact"]) expect(patch).toContain(`newScreenProps.${prop}`);
  });
  it("exposes all title and supported minimization modes rather than another boolean", () => {
    for (const mode of ["Automatic", "Always", "Never", "Inline"]) expect(patch).toContain(`UINavigationItemLargeTitleDisplayMode${mode}`);
    for (const mode of ["Automatic", "Never", "OnScrollDown", "OnScrollUp"]) expect(patch).toContain(`UIBarMinimizationBehavior${mode}`);
    expect(patch).toContain("RNS_IPHONE_OS_VERSION_AVAILABLE(17_0)");
    expect(patch).toContain("UINavigationItemStyleNavigator");
    expect(patch).toContain("navctr.hidesBarsOnSwipe = config.hidesBarsOnSwipe");
    expect(patch).toContain("override fun setLargeTitleDisplayMode");
    expect(patch).toContain("override fun setNavigationBarMinimizationBehavior");
  });
  it("requires linked runtime support before advertising the capability", () => {
    const module = readFileSync(new URL("../modules/nomly-glass/ios/NomlyGlassModule.swift", import.meta.url), "utf8");
    expect(module).toContain('Constant("nativeHeaderConfigurationVersion")');
    expect(module).toContain('instancesRespond(to: NSSelectorFromString("setLargeTitleDisplayMode:"))');
  });
});
