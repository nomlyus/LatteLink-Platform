import { useEffect } from "react";
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { uiPalette } from "../ui/system";

function LoadingBlock({ width = "100%", height, style }: {
  width?: number | `${number}%`; height: number; style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.block, { width, height }, style]} />;
}

export function CustomizeModalLoadingSheet() {
  const insets = useSafeAreaInsets();
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 820, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: interpolate(pulse.value, [0, 1], [0.52, 1]) }));

  return <View style={styles.sheet} accessibilityLabel="Loading item details" accessibilityState={{ busy: true }}>
    <ScrollView scrollEnabled={false} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <View style={styles.hero}>
        <Animated.View style={[styles.image, pulseStyle]} />
        <Animated.View style={[styles.details, pulseStyle]}>
          <View style={styles.titleRow}>
            <LoadingBlock width="62%" height={30} style={styles.artworkText} />
            <LoadingBlock width={68} height={20} style={styles.artworkText} />
          </View>
          <LoadingBlock width="92%" height={16} style={styles.artworkText} />
          <LoadingBlock width="76%" height={16} style={styles.artworkText} />
        </Animated.View>
      </View>
      <Animated.View style={[styles.content, pulseStyle]}>
        {[0, 1].map((key) => <View key={key} style={styles.card}>
          <View style={styles.titleRow}>
            <LoadingBlock width={64} height={22} />
            <LoadingBlock width={72} height={22} />
          </View>
          <LoadingBlock width="42%" height={24} />
          {[0, 1, 2].map((option) => <View key={option} style={styles.option}>
            <LoadingBlock width={22} height={22} style={styles.selection} />
            <LoadingBlock width={option === 0 ? "48%" : "35%"} height={16} />
          </View>)}
        </View>)}
        <View style={styles.notes}>
          <LoadingBlock width={78} height={20} />
          <LoadingBlock width="100%" height={64} />
          {[0, 1].map((key) => <View key={key} style={styles.titleRow}>
            <LoadingBlock width={100} height={18} />
            <LoadingBlock width={54} height={18} />
          </View>)}
        </View>
      </Animated.View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: uiPalette.surfaceStrong },
  // Match the artwork's geometry: details belong inside the image, not beneath it.
  hero: { width: "100%", minHeight: 500, paddingTop: 280, justifyContent: "flex-end", backgroundColor: "#000000" },
  image: { ...StyleSheet.absoluteFill, backgroundColor: uiPalette.accentSoft },
  details: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 28, gap: 10 },
  titleRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 16 },
  block: { borderRadius: 8, backgroundColor: uiPalette.accentSoft },
  artworkText: { backgroundColor: "rgba(255,255,255,0.25)" },
  content: { paddingHorizontal: 20 },
  card: { marginTop: 18, borderRadius: 28, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18, gap: 14, borderWidth: 1, borderColor: uiPalette.border },
  option: { minHeight: 58, borderRadius: 20, borderWidth: 1, borderColor: uiPalette.border, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  selection: { borderRadius: 11 },
  notes: { paddingVertical: 24, gap: 20 }
});
