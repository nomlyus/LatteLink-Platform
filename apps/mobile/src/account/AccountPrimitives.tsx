import { canUseLiquidGlass } from "../ui/glass";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { uiPalette, uiTypography } from "../ui/system";

export function AccountPageRow({
  label,
  isLast = false,
  onPress
}: {
  label: string;
  isLast?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.pageRow, pressed ? styles.pageRowPressed : null]}
    >
      <View style={styles.pageRowInner}>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} numberOfLines={1} style={styles.pageRowLabel}>
          {label}
        </Text>
        <Ionicons name="arrow-forward" size={16} color={uiPalette.text} style={styles.pageRowChevron} />
      </View>
      {isLast ? null : <View style={styles.pageRowDivider} />}
    </Pressable>
  );
}

export function GuestSignInPill({ label, onPress }: { label: string; onPress: () => void }) {
  const useLiquidGlass = canUseLiquidGlass();
  const content = (
    <View style={[styles.loggedOutStaticCtaContent, useLiquidGlass ? null : styles.loggedOutStaticCtaContentFallback]}>
      <Ionicons name="log-in-outline" size={16} color={uiPalette.text} />
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.loggedOutStaticCtaLabel}>
        {label}
      </Text>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.loggedOutStaticCtaPressable, pressed ? styles.glassPillPressed : null]}
    >
      <View style={styles.loggedOutStaticCtaShell}>
        {useLiquidGlass ? (
          <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.loggedOutStaticCtaFrame}>
            {content}
          </GlassView>
        ) : (
          <BlurView tint="light" intensity={Platform.OS === "ios" ? 28 : 24} style={styles.loggedOutStaticCtaFrame}>
            {content}
          </BlurView>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loggedOutStaticCtaPressable: {
    alignSelf: "stretch"
  },
  loggedOutStaticCtaShell: {
    borderRadius: 999,
    overflow: "hidden"
  },
  loggedOutStaticCtaFrame: {
    borderRadius: 999,
    overflow: "hidden"
  },
  loggedOutStaticCtaContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 999,
    backgroundColor: "rgba(255, 252, 246, 0.10)"
  },
  loggedOutStaticCtaContentFallback: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)"
  },
  loggedOutStaticCtaLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: 0.05,
    color: uiPalette.text,
    fontFamily: uiTypography.bodyFamily
  },
  glassPillPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.992 }]
  },
  pageRow: {
    minHeight: 68
  },
  pageRowPressed: {
    opacity: 0.72
  },
  pageRowInner: {
    minHeight: 68,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  pageRowLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  },
  pageRowChevron: {
    flexShrink: 0
  },
  pageRowDivider: {
    marginHorizontal: 12,
    height: 1,
    backgroundColor: uiPalette.border
  }
});
