import { Ionicons } from "@expo/vector-icons";
import { NativeTabs } from "expo-router/native-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { uiPalette } from "../ui/systemColors";
import type { CartAccessorySummary } from "./cartAccessoryModel";

type CartAccessoryProps = {
  summary: CartAccessorySummary;
  onOpenCart: () => void;
};

/** UIKit may mount both placements: they are stateless views of the same cart snapshot. */
export function NativeCartAccessory(props: CartAccessoryProps) {
  return <CartAccessoryContent {...props} placement={NativeTabs.BottomAccessory.usePlacement()} />;
}

export function CartAccessoryContent({
  summary,
  onOpenCart,
  placement = "regular",
  fallback = false
}: CartAccessoryProps & {
  placement?: "regular" | "inline";
  fallback?: boolean;
}) {
  const foreground = uiPalette.text;
  const inline = placement === "inline";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={summary.accessibilityLabel}
      onPress={onOpenCart}
      // Keep layout static: NativeWind's interop cannot resolve Pressable style callbacks.
      style={[
        styles.button,
        inline ? styles.inline : styles.regular,
        fallback ? { backgroundColor: uiPalette.surfaceStrong } : null
      ]}
    >
      <Ionicons name="bag-handle-outline" size={inline ? 18 : 21} color={foreground} />
      <View style={styles.copy}>
        <Text
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          numberOfLines={1}
          style={[styles.label, styles.count, inline ? styles.inlineLabel : null, { color: foreground }]}
        >
          {summary.countLabel}
        </Text>
        <Text
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          numberOfLines={1}
          style={[styles.label, styles.subtotal, inline ? styles.inlineLabel : null, { color: foreground }]}
        >
          {summary.subtotalLabel}
        </Text>
      </View>
      <Ionicons name="arrow-forward" size={inline ? 16 : 19} color={foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    width: "100%",
    minHeight: 44,
    borderRadius: 999,
    minWidth: 0
  },
  regular: { flex: 1, paddingHorizontal: 18, gap: 12 },
  inline: { flex: 1, paddingHorizontal: 8, gap: 6 },
  copy: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  count: { flexShrink: 1 },
  subtotal: {
    flexShrink: 0,
    textAlign: "right",
    fontVariant: ["tabular-nums"]
  },
  label: { fontSize: 15, fontWeight: "500" },
  inlineLabel: { fontSize: 13 }
});
