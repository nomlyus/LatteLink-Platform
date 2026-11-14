import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { useRouter } from "expo-router";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useCart } from "../cart/store";
import { uiPalette, uiTypography } from "../ui/system";
import { formatCartTabCount } from "./bottomTabs";
import type { PillTabBarVariant } from "./pillTabBarShared";

/** Cart is a root-stack modal action, not a fifth tab. */
export function TabBarCartButton({ variant }: { variant: PillTabBarVariant }) {
  const router = useRouter();
  const { itemCount } = useCart();
  if (itemCount <= 0) return null;

  const content = (
    <View style={variant === "glass" ? styles.glassInner : styles.blurInner}>
      <Ionicons name="bag-handle-outline" size={21} color={uiPalette.text} />
      <View style={styles.countBadge}>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.countLabel}>
          {formatCartTabCount(itemCount)}
        </Text>
      </View>
    </View>
  );

  return (
    <Pressable accessibilityLabel="Open cart" style={styles.button} onPress={() => router.push("/cart")}>
      {variant === "glass" ? (
        <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.surface}>
          {content}
        </GlassView>
      ) : (
        <BlurView tint="systemMaterial" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.surface}>
          {content}
        </BlurView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 58, minWidth: 58, height: 58, borderRadius: 999 },
  surface: { flex: 1, borderRadius: 999, overflow: "hidden" },
  blurInner: {
    flex: 1,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: uiPalette.surfaceStrong,
    borderWidth: 1,
    borderColor: uiPalette.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  },
  glassInner: {
    flex: 1,
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.004)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.11)"
  },
  countBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiPalette.primary
  },
  countLabel: {
    fontSize: 10,
    lineHeight: 10,
    color: uiPalette.primaryText,
    fontWeight: "700",
    fontFamily: uiTypography.bodyFamily
  }
});
