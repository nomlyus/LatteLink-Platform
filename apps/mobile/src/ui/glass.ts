import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Platform } from "react-native";

/** Guard native availability checks on older iOS versions and non-iOS builds. */
export function canUseLiquidGlass() {
  if (Platform.OS !== "ios") return false;
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}
