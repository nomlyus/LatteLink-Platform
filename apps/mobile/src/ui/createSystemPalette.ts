import type { ColorValue } from "react-native";
import { brandColors } from "./brandColors";

type ResolveColor = (ios: string, android: string, fallback: string) => Exclude<ColorValue, number | null | undefined>;

/** Native platforms resolve semantic roles themselves, including increased contrast on iOS. */
export function createSystemPalette(resolve: ResolveColor) {
  const background = resolve("systemBackground", "?android:attr/colorBackground", "#FFFFFF");
  const surface = resolve("secondarySystemBackground", "?android:attr/colorBackgroundFloating", "#F2F2F7");
  const groupedSurface = resolve("secondarySystemGroupedBackground", "?android:attr/colorBackgroundFloating", "#FFFFFF");
  const text = resolve("label", "?android:attr/textColorPrimary", "#000000");
  const secondary = resolve("secondaryLabel", "?android:attr/textColorSecondary", "#3C3C4399");
  const separator = resolve("separator", "?android:attr/colorControlHighlight", "#3C3C434A");

  return {
    background,
    backgroundAlt: resolve("systemGroupedBackground", "?android:attr/colorBackground", "#F2F2F7"),
    surfaceStrong: surface,
    surfaceMuted: surface,
    surfaceGlass: groupedSurface,
    card: groupedSurface,
    cardMuted: surface,
    text,
    textSecondary: secondary,
    textMuted: resolve("tertiaryLabel", "?android:attr/textColorHint", "#3C3C434D"),
    border: separator,
    borderStrong: resolve("opaqueSeparator", "?android:attr/colorControlNormal", "#C6C6C8"),
    primary: brandColors.forest,
    primaryText: brandColors.onForest,
    accent: brandColors.forest,
    accentSoft: resolve("tertiarySystemFill", "?android:attr/colorControlHighlight", "#7676801F"),
    warning: resolve("systemOrange", "?android:attr/colorAccent", "#FF9500"),
    danger: resolve("systemRed", "?android:attr/colorError", "#FF3B30"),
    success: resolve("systemGreen", "?android:attr/colorAccent", "#34C759"),
    chromeText: brandColors.forest,
    chromeMuted: secondary,
    // Brand/decorative colors are intentionally independent of interface appearance.
    brass: "#8E7761",
    walnut: "#31261F",
    charcoal: "#1D1A17",
    glow: "rgba(255, 255, 255, 0.56)"
  } as const;
}
