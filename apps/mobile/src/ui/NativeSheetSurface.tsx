import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native";
import { canUseLiquidGlass } from "./glass";
import { uiPalette } from "./system";

export function NativeSheetSurface({ children, contentTopPadding = 0 }: { children: ReactNode; contentTopPadding?: number }) {
  const [reduceTransparency, setReduceTransparency] = useState(true);

  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener("reduceTransparencyChanged", (enabled) => {
      changed = true;
      if (active) setReduceTransparency(enabled);
    });
    void AccessibilityInfo.isReduceTransparencyEnabled().then(
      (enabled) => {
        if (active && !changed) setReduceTransparency(enabled);
      },
      () => { /* Keep a readable opaque surface when the setting is unavailable. */ }
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return (
    <View collapsable={false} accessibilityViewIsModal style={[styles.sheet, { paddingTop: contentTopPadding }]}>
      {reduceTransparency || Platform.OS !== "ios" ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.opaque]} />
      ) : canUseLiquidGlass() ? (
        <GlassView pointerEvents="none" glassEffectStyle="regular" colorScheme="auto" style={StyleSheet.absoluteFill} />
      ) : (
        <BlurView pointerEvents="none" tint="systemMaterial" intensity={60} style={StyleSheet.absoluteFill} />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, overflow: "hidden" },
  opaque: { backgroundColor: uiPalette.surfaceStrong }
});
