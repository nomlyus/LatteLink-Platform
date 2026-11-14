import type { ColorValue } from "react-native";

/** Glass style and appearance are independent: clear/regular is not light/dark. */
export type NativeGlassConfiguration = {
  glassEffectStyle?: "regular" | "clear" | "none";
  colorScheme?: "auto" | "light" | "dark";
  material?: "glass" | "frosted" | "none";
  blurStyle?: "ultraThin" | "thin" | "regular" | "thick" | "chrome";
  glassTintColor?: ColorValue;
  isInteractive?: boolean;
  cornerMode?: "concentric" | "fixed" | "capsule";
  cornerRadius?: number;
  minimumCornerRadius?: number;
  animationDuration?: number;
};

export function nativeGlassProps(configuration: NativeGlassConfiguration = {}) {
  return {
    ...configuration,
    colorScheme: configuration.colorScheme ?? "auto",
    minimumCornerRadius: positive(configuration.minimumCornerRadius, 32),
    cornerRadius: nonnegative(configuration.cornerRadius, 32),
    animationDuration: Math.min(nonnegative(configuration.animationDuration, 0), 5)
  };
}

function nonnegative(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function positive(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}
