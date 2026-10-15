import { useMenuImage } from "../menu/useMenuImage";
import { Ionicons } from "@expo/vector-icons";
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import type { ComponentProps } from "react";

import { uiPalette } from "../ui/system";

function resolveOrderItemIcon(name: string) {
  const haystack = name.toLowerCase();
  if (haystack.includes("tea") || haystack.includes("matcha")) return "leaf-outline" as const;
  if (["croissant", "cookie", "muffin", "pastry"].some((word) => haystack.includes(word))) {
    return "nutrition-outline" as const;
  }
  if (["latte", "espresso", "coffee", "cappuccino", "cortado"].some((word) => haystack.includes(word))) {
    return "cafe-outline" as const;
  }
  return "sparkles-outline" as const;
}

export type OrderItemThumbnailProps = {
  label: string;
  imageUrl?: string;
  size?: "small" | "medium";
  style?: StyleProp<ViewStyle>;
  fallbackIcon?: ComponentProps<typeof Ionicons>["name"];
};

export function OrderItemThumbnail({ label, imageUrl, size = "medium", style, fallbackIcon }: OrderItemThumbnailProps) {
  const { activeImageUrl, imageFailed, onImageError } = useMenuImage(imageUrl, "list");

  const imageStyle = size === "small" ? styles.smallImage : styles.mediumImage;
  return (
    <View style={[size === "small" ? styles.small : styles.medium, style]}>
      {activeImageUrl && !imageFailed ? (
        <Image source={{ uri: activeImageUrl }} style={imageStyle} resizeMode="cover" onError={onImageError} />
      ) : (
        <Ionicons
          name={fallbackIcon ?? resolveOrderItemIcon(label)}
          size={size === "small" ? 16 : 22}
          color={uiPalette.accent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  medium: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: uiPalette.surfaceMuted
  },
  small: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: uiPalette.surfaceMuted
  },
  mediumImage: {
    width: "100%",
    height: "100%"
  },
  smallImage: {
    width: "100%",
    height: "100%"
  }
});
