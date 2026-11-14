import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { OrderHistoryEntry } from "../account/data";
import { OrderItemThumbnail } from "../components/OrderItemThumbnail";
import { formatUsd, type MenuItem } from "../menu/catalog";
import { uiPalette } from "../ui/system";
import { orderStatusLabel } from "./archive";
import { buildOrderItemsSummary } from "./presentation";
import { findLatestOrderTime, formatOrderDateTime } from "./history";

export function OrderArchiveRow({ order, menuItemsById, onPress }: {
  order: OrderHistoryEntry; menuItemsById: Map<string, MenuItem>; onPress: () => void;
}) {
  const firstItem = order.items[0];
  const menuItem = firstItem ? menuItemsById.get(firstItem.itemId) : undefined;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open order ${order.pickupCode}, ${orderStatusLabel(order.status)}`} style={styles.row}>
    <OrderItemThumbnail label={firstItem?.itemName ?? menuItem?.name ?? "Order"} imageUrl={menuItem?.imageUrl} size="small" style={styles.image} fallbackSymbol={{ ios: "bag", android: "shopping_bag" }} />
    <View style={styles.copy}>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} numberOfLines={1} style={styles.title}>{buildOrderItemsSummary(order, menuItemsById)}</Text>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.subtitle}>{orderStatusLabel(order.status)} · {formatUsd(order.total.amountCents)}</Text>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.subtitle}>{formatOrderDateTime(findLatestOrderTime(order))}</Text>
    </View>
    <SymbolView name={{ ios: "chevron.right", android: "chevron_right" }} size={14} weight="semibold" tintColor={uiPalette.textSecondary} />
  </Pressable>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, minHeight: 78 },
  image: { width: 46, height: 46, borderRadius: 12 },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 17, fontWeight: "600", color: uiPalette.text },
  subtitle: { fontSize: 15, color: uiPalette.textSecondary }
});
