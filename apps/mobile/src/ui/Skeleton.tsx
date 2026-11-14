import { useEffect, type ReactNode } from "react";
import { StyleSheet, View, type DimensionValue } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { uiPalette } from "./systemColors";

export function SkeletonBlock({ width = "100%", height = 16, radius = 8 }: { width?: DimensionValue; height?: number; radius?: number }) {
  return <View accessible={false} style={{ width, height, borderRadius: radius, backgroundColor: uiPalette.surfaceMuted }} />;
}
export function SkeletonPulse({ children }: { children: ReactNode }) {
  const opacity = useSharedValue(0.6);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    opacity.value = reduceMotion ? 0.7 : withRepeat(withTiming(1, { duration: 820, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.content, animatedStyle]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{children}</Animated.View>;
}
const styles = StyleSheet.create({ content: { gap: 20 } });
