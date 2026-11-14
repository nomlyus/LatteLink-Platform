import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { uiPalette as ios } from "../src/ui/systemColors.ios";
import { uiPalette as android } from "../src/ui/systemColors.android";
import { uiPalette as fallback } from "../src/ui/systemColors";

vi.mock("react-native", () => ({ PlatformColor: (name: string) => ({ semantic: [name] }) }));

describe("native semantic interface colors", () => {
  it("uses UIKit's dynamic roles rather than fixed light/dark hex palettes", () => {
    expect(ios.background).toEqual({ semantic: ["systemBackground"] });
    expect(ios.card).toEqual({ semantic: ["secondarySystemGroupedBackground"] });
    expect(ios.surfaceStrong).toEqual({ semantic: ["secondarySystemBackground"] });
    expect(ios.text).toEqual({ semantic: ["label"] });
    expect(ios.textSecondary).toEqual({ semantic: ["secondaryLabel"] });
    expect(ios.border).toEqual({ semantic: ["separator"] });
    expect(ios.primary).toBe("#134733");
    expect(ios.primaryText).toBe("#FFFFFF");
  });
  it("resolves Android roles from native theme attributes, not UIKit color names", () => {
    expect(android.background).toEqual({ semantic: ["?android:attr/colorBackground"] });
    expect(android.text).toEqual({ semantic: ["?android:attr/textColorPrimary"] });
    expect(android.surfaceStrong).toEqual({ semantic: ["?android:attr/colorBackgroundFloating"] });
  });
  it("provides neutral non-native fallbacks while leaving decorative brand colors fixed", () => {
    expect(fallback.background).toBe("#FFFFFF");
    expect(ios.walnut).toBe(fallback.walnut);
    expect(ios.brass).toBe(android.brass);
  });
  it("shares the forest-green action tint across platforms without recoloring neutral text", () => {
    for (const palette of [ios, android, fallback]) {
      expect(palette.accent).toBe("#134733");
      expect(palette.chromeText).toBe("#134733");
      expect(palette.primary).toBe("#134733");
      expect(palette.text).not.toBe(palette.accent);
    }
  });
  it("removes the app-level light-mode lock without changing native status-bar ownership", () => {
    const config = readFileSync(new URL("../app.config.ts", import.meta.url), "utf8");
    const plist = readFileSync(new URL("../ios/LatteLinkBeta/Info.plist", import.meta.url), "utf8");
    expect(config).toContain('userInterfaceStyle: "automatic"');
    expect(plist).not.toContain("<key>UIUserInterfaceStyle</key>");
    expect(plist).toContain("<key>UIViewControllerBasedStatusBarAppearance</key>\n    <false/>");
  });
  it("keeps native semantic colors out of Reanimated's hex-color interpolation", () => {
    const progress = readFileSync(new URL("../src/orders/OrderProgress.tsx", import.meta.url), "utf8");
    expect(progress).not.toContain("interpolateColor");
    expect(progress).toContain("withTiming(targetIndex");
    expect(progress).toContain("styles.activeDot, activeDotStyle");
    expect(progress).toContain("styles.completeDot, completeDotStyle");
  });
});
