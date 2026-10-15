import { StyleSheet, Text, View } from "react-native";
import { describeCustomization, type CartItem } from "../cart/model";
import { formatUsd } from "../menu/catalog";
import { uiPalette } from "../ui/system";

export function StatusBanner({ message, tone = "info" }: { message: string; tone?: "info" | "warning" }) {
  return (
    <View style={[styles.banner, tone === "warning" ? styles.bannerWarning : null]}>
      <Text
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
        style={[styles.bannerText, tone === "warning" ? styles.bannerTextWarning : null]}
      >
        {message}
      </Text>
    </View>
  );
}

export function SummaryRow({
  label,
  value,
  emphasized = false
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
        style={[styles.summaryLabel, emphasized ? styles.summaryLabelEmphasized : null]}
      >
        {label}
      </Text>
      <Text
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
        style={[styles.summaryValue, emphasized ? styles.summaryValueEmphasized : null]}
      >
        {value}
      </Text>
    </View>
  );
}

export function BagLineItem({ item }: { item: CartItem }) {
  const customization = describeCustomization(item, { includeNotes: true, fallback: "Standard preparation" });
  return (
    <View style={styles.bagItem}>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.bagQuantity}>
        {item.quantity}x
      </Text>
      <View style={styles.bagCopy}>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.bagItemTitle}>
          {item.itemName}
        </Text>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.bagItemMeta}>
          {customization}
        </Text>
      </View>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.bagItemPrice}>
        {formatUsd(item.lineTotalCents)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: uiPalette.surfaceMuted,
    borderWidth: 1,
    borderColor: uiPalette.border
  },
  bannerWarning: {
    backgroundColor: "rgba(176, 122, 58, 0.08)",
    borderColor: "rgba(176, 122, 58, 0.18)"
  },
  bannerText: {
    fontSize: 13,
    lineHeight: 19,
    color: uiPalette.textSecondary
  },
  bannerTextWarning: {
    color: uiPalette.text
  },
  bagItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12
  },
  bagQuantity: {
    width: 28,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: uiPalette.textSecondary
  },
  bagCopy: {
    flex: 1,
    gap: 4
  },
  bagItemTitle: {
    fontSize: 15,
    lineHeight: 19,
    color: uiPalette.text,
    fontWeight: "700"
  },
  bagItemMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: uiPalette.textSecondary
  },
  bagItemPrice: {
    fontSize: 15,
    lineHeight: 19,
    color: uiPalette.text,
    fontWeight: "700"
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4
  },
  summaryLabel: {
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.textSecondary
  },
  summaryLabelEmphasized: {
    color: uiPalette.text,
    fontWeight: "700"
  },
  summaryValue: {
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.text
  },
  summaryValueEmphasized: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700"
  }
});
