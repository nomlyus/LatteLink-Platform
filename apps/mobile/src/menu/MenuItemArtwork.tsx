import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import { formatUsd, type MenuItem } from "./catalog";
import { ProductImage } from "./MenuCustomizeStates";

/** Artwork and details are siblings; only the artwork is scaled behind the foreground content. */
export function MenuItemArtwork({ item, unitPriceCents, onReady }: {
  item: MenuItem; unitPriceCents: number; onReady: () => void;
}) {
  return <View style={styles.hero}>
    <ProductImage imageUrl={item.imageUrl} onReady={onReady} style={styles.artwork} />
    <LinearGradient pointerEvents="none" style={StyleSheet.absoluteFill}
      colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.08)", "rgba(0,0,0,0.82)", "rgba(0,0,0,0.96)"]}
      locations={[0, 0.35, 0.7, 1]} />
    <View style={styles.details}>
      <View style={styles.titleRow}>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.name}>{item.name}</Text>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.price}>{formatUsd(unitPriceCents)}</Text>
      </View>
      {item.description ? <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.description}>{item.description}</Text> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  hero: { width: "100%", minHeight: 500, paddingTop: 280, justifyContent: "flex-end", backgroundColor: "#000000" },
  artwork: { ...StyleSheet.absoluteFill, aspectRatio: undefined },
  details: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 28, gap: 10 },
  titleRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 16 },
  // These labels sit on darkened artwork in both appearances, rather than on a system surface.
  name: { flex: 1, minWidth: 0, fontSize: 30, lineHeight: 36, fontWeight: "700", color: "#FFFFFF", textAlign: "left" },
  price: { flexShrink: 0, fontSize: 17, lineHeight: 23, fontWeight: "600", color: "#FFFFFF", textAlign: "right" },
  description: { fontSize: 15, lineHeight: 23, color: "rgba(255,255,255,0.88)", textAlign: "left" }
});
