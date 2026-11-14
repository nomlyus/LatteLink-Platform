import { requireNativeView, requireOptionalNativeModule } from "expo";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";
import type { NativeGlassConfiguration } from "./nativeGlassConfiguration";

const capabilities = Platform.OS === "ios"
  ? requireOptionalNativeModule<{ supportsConcentricCorners: boolean; cornerConfigurationVersion?: number; glassConfigurationVersion?: number }>("NomlyGlass")
  : null;
const ConcentricView = capabilities?.supportsConcentricCorners && (capabilities.cornerConfigurationVersion ?? 0) >= 3
  && (capabilities.glassConfigurationVersion ?? 0) >= 1
  ? requireNativeView<ViewProps & NativeGlassConfiguration>("NomlyGlass", "ConcentricGlassView")
  : null;

/** Solid content surfaces use UIKit's corner geometry without adding a glass material. */
export function NativeCornerView({ fallbackRadius = 20, cornerMode = "concentric", style, ...props }: ViewProps & {
  fallbackRadius?: number;
  cornerMode?: "concentric" | "fixed";
}) {
  if (!ConcentricView) return <View {...props} style={[style, { borderRadius: fallbackRadius }, styles.clip]} />;
  return <ConcentricView {...props} material="none" colorScheme="auto" cornerMode={cornerMode}
    minimumCornerRadius={fallbackRadius} cornerRadius={fallbackRadius} style={[style, styles.clip]} />;
}

const styles = StyleSheet.create({ clip: { overflow: "hidden" } });
