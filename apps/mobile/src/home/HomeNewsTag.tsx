import { canUseLiquidGlass } from "../ui/glass";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { Platform, StyleSheet, Text, View } from "react-native";
import { uiPalette } from "../ui/system";

export function HomeNewsTag({ label }: { label: string }) {
  const useLiquidGlass = canUseLiquidGlass();
  const content = (
    <View style={[styles.newsLabelInner, useLiquidGlass ? styles.newsLabelInnerGlass : styles.newsLabelInnerFallback]}>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.newsLabelText}>
        {label}
      </Text>
    </View>
  );
  return (
    <View style={styles.newsLabelShell}>
      {useLiquidGlass ? (
        <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.newsLabelFrame}>
          {content}
        </GlassView>
      ) : (
        <BlurView tint="light" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.newsLabelFrame}>
          {content}
        </BlurView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  newsLabelShell: {
    alignSelf: "flex-start",
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4
  },
  newsLabelFrame: { borderRadius: 999, overflow: "hidden" },
  newsLabelInner: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1
  },
  newsLabelInnerGlass: { backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.16)" },
  newsLabelInnerFallback: { backgroundColor: "rgba(255,255,255,0.36)", borderColor: "rgba(255,255,255,0.28)" },
  newsLabelText: { fontSize: 11, lineHeight: 13, letterSpacing: 1.1, fontWeight: "700", color: uiPalette.textSecondary }
});
