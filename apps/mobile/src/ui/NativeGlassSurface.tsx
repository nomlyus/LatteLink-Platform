import { requireNativeView, requireOptionalNativeModule } from "expo";
import type { ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { canUseLiquidGlass } from "./glass";
import { GlassCard } from "./system";
import { nativeGlassProps, type NativeGlassConfiguration } from "./nativeGlassConfiguration";

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<{ supportsConcentricCorners: boolean; cornerConfigurationVersion?: number; glassConfigurationVersion?: number }>("NomlyGlass")
  : null;
const NativeConcentricGlass = nativeModule?.supportsConcentricCorners && (nativeModule.cornerConfigurationVersion ?? 0) >= 2
  ? requireNativeView<ViewProps & NativeGlassConfiguration>("NomlyGlass", "ConcentricGlassView")
  : null;

export function NativeGlassSurface({ children, style, contentStyle, glass }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  glass?: NativeGlassConfiguration;
}) {
  if (!NativeConcentricGlass || !canUseLiquidGlass()) {
    // Also bypass the first native implementation, which could resolve square corners.
    return <GlassCard style={style} contentStyle={contentStyle}>{children}</GlassCard>;
  }
  return (
    <View style={style}>
      <NativeConcentricGlass
        {...((nativeModule?.glassConfigurationVersion ?? 0) >= 1 ? nativeGlassProps(glass) : { minimumCornerRadius: 32 })}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  // No fixed-radius clipping here: it would cut off UIKit's adaptive glass corners.
  content: { padding: 20 }
});
