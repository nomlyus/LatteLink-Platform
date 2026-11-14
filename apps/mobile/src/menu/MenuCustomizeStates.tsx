import { useMenuImage } from "./useMenuImage";
import { SymbolView } from "expo-symbols";
import { useEffect } from "react";
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { uiPalette } from "../ui/system";
import { ScreenState } from "../ui/ScreenState";

export function ProductImage({ imageUrl, onReady, style }: { imageUrl?: string; onReady?: () => void; style?: StyleProp<ViewStyle> }) {
  const { activeImageUrl, imageFailed, onImageError } = useMenuImage(imageUrl, "hero", onReady);

  useEffect(() => {
    if (!activeImageUrl) onReady?.();
  }, [activeImageUrl, onReady]);

  return (
    <View style={[styles.heroImage, style]}>
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
          <SymbolView name={{ ios: "cup.and.saucer", android: "local_cafe" }} size={34} tintColor={uiPalette.textSecondary} />
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
  return <View style={[styles.backdrop, styles.centerState]}>
    <ScreenState title={title} message={body} actionLabel={actionLabel} onAction={onAction} />
  </View>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "transparent" },
  centerState: { alignItems: "center", justifyContent: "center" },
  heroImage: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: uiPalette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  heroImagePhoto: { width: "100%", height: "100%" },
  heroDrink: {
    width: 126,
    height: 280,
    borderRadius: 30,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  }
});
