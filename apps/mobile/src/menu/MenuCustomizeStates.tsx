import { useMenuImage } from "./useMenuImage";
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { uiPalette, uiTypography } from "../ui/system";

export function ProductImage({ imageUrl, onReady }: { imageUrl?: string; onReady?: () => void }) {
  const { activeImageUrl, imageFailed, onImageError } = useMenuImage(imageUrl, "hero", onReady);

  useEffect(() => {
    if (!activeImageUrl) onReady?.();
  }, [activeImageUrl, onReady]);

  return (
    <View style={styles.heroImage}>
      {activeImageUrl && !imageFailed ? (
        <Image
          source={{ uri: activeImageUrl }}
          style={styles.heroImagePhoto}
          resizeMode="cover"
          onLoadEnd={onReady}
          onError={onImageError}
        />
      ) : (
        <View style={styles.heroDrink}>
          <Ionicons name="cafe-outline" size={34} color={uiPalette.surfaceStrong} />
        </View>
      )}
    </View>
  );
}

export function SimpleModalState({
  title,
  body,
  actionLabel,
  onAction
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.backdrop}>
      <View style={[styles.sheet, styles.centerState]}>
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.centerTitle}>
          {title}
        </Text>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.centerText}>
          {body}
        </Text>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={onAction}
            style={styles.inlinePrimary}
          >
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.inlinePrimaryText}>
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "transparent" },
  sheet: {
    flex: 1,
    backgroundColor: "rgba(246, 247, 244, 0.98)",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: uiPalette.border,
    overflow: "hidden"
  },
  handleWrap: { position: "absolute", top: 16, left: 0, right: 0, alignItems: "center", zIndex: 10 },
  handle: { width: 38, height: 5, borderRadius: 999, backgroundColor: "rgba(151, 160, 154, 0.52)" },
  centerState: { alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  centerTitle: {
    fontSize: 30,
    lineHeight: 36,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600",
    textAlign: "center"
  },
  centerText: { marginTop: 10, fontSize: 15, lineHeight: 24, color: uiPalette.textSecondary, textAlign: "center" },
  inlinePrimary: {
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: uiPalette.primary
  },
  inlinePrimaryText: { color: uiPalette.primaryText, fontSize: 15, lineHeight: 20, fontWeight: "600" },
  heroImage: {
    height: 420,
    backgroundColor: "#9BD8FF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  heroImagePhoto: { width: "100%", height: "100%" },
  heroDrink: {
    width: 126,
    height: 280,
    borderRadius: 30,
    backgroundColor: "rgba(29, 26, 23, 0.68)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)"
  }
});
