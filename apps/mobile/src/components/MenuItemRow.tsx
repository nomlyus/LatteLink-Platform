import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { formatUsd, resolveMenuImageUrl, type MenuItem } from "../menu/catalog";
import { uiPalette, uiTypography } from "../ui/system";

export type MenuItemRowProps = {
  item: MenuItem;
  isLast: boolean;
  onPress: (item: MenuItem) => void;
  onImageReady?: () => void;
};

function MenuItemArtwork({
  imageUrl,
  onReady
}: {
  imageUrl?: string;
  onReady?: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const optimizedImageUrl = resolveMenuImageUrl(imageUrl, "list");
  const [activeImageUrl, setActiveImageUrl] = useState(optimizedImageUrl);

  useEffect(() => {
    setImageFailed(false);
    setActiveImageUrl(optimizedImageUrl);
  }, [optimizedImageUrl]);

  useEffect(() => {
    if (!activeImageUrl) {
      onReady?.();
    }
  }, [activeImageUrl, onReady]);

  return (
    <View style={styles.menuImage}>
      {activeImageUrl && !imageFailed ? (
        <Image
          source={{ uri: activeImageUrl }}
          style={styles.menuImagePhoto}
          resizeMode="cover"
          onLoadEnd={onReady}
          onError={() => {
            if (imageUrl && activeImageUrl !== imageUrl) {
              setActiveImageUrl(imageUrl);
              return;
            }
            setImageFailed(true);
            onReady?.();
          }}
        />
      ) : (
        <Ionicons name="cafe-outline" size={22} color={uiPalette.accent} />
      )}
    </View>
  );
}

export function MenuItemRow({ item, isLast, onPress, onImageReady }: MenuItemRowProps) {
  return (
    <Pressable onPress={() => onPress(item)} style={({ pressed }) => [styles.menuRow, pressed ? styles.pressed : null]}>
      <View style={styles.menuRowMain}>
        <MenuItemArtwork imageUrl={item.imageUrl} onReady={onImageReady} />
        <View style={[styles.menuBodyWrap, !isLast ? styles.menuBodyWrapWithDivider : null]}>
          <View style={styles.menuBodyContent}>
            <View style={styles.menuCopy}>
              <View style={styles.menuTitleRow}>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.menuTitle}>{item.name}</Text>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.menuMeta}>{formatUsd(item.priceCents)}</Text>
              </View>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} numberOfLines={3} style={styles.menuDescription}>
                {item.description}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  menuRow: {
    minHeight: 132
  },
  menuRowMain: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    width: "100%"
  },
  menuImage: {
    width: 108,
    height: 132,
    backgroundColor: "#D5D4CE",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  menuImagePhoto: {
    width: "100%",
    height: "100%"
  },
  menuBodyWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: 132,
    paddingTop: 0,
    paddingBottom: 0,
    justifyContent: "center"
  },
  menuBodyWrapWithDivider: {
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border
  },
  menuBodyContent: {
    minHeight: 132,
    justifyContent: "center",
    paddingVertical: 10
  },
  menuCopy: {
    justifyContent: "center",
    gap: 1
  },
  menuTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  menuTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "500"
  },
  menuDescription: {
    fontSize: 12,
    lineHeight: 14,
    color: uiPalette.textSecondary
  },
  menuMeta: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "400"
  },
  pressed: {
    opacity: 0.84
  }
});
