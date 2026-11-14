import { SymbolView } from "expo-symbols";
import { StyleSheet, Text, View } from "react-native";
import type { OrderHistoryEntry, LoyaltyLedgerEntry } from "../account/data";
import { OrderItemThumbnail } from "../components/OrderItemThumbnail";
import { formatUsd, type MenuItem } from "../menu/catalog";
import { uiPalette } from "../ui/system";
import { OrderProgress } from "./OrderProgress";
import { orderStatusLabel } from "./archive";
import { formatOrderDateTime, getLatestOrderTimelineNote } from "./history";
import { formatOrderItemDescription, sumReturnedPoints } from "./presentation";

/** Pure receipt presentation also used by the isolated development gallery. */
export function renderOrderReceipt({ order, brandName, menuItemsById = new Map(), reversals = [] }: {
  order: OrderHistoryEntry; brandName: string; menuItemsById?: Map<string, MenuItem>; reversals?: LoyaltyLedgerEntry[];
}) {
  const createdAt = order.timeline.map((event) => Date.parse(event.occurredAt)).filter(Number.isFinite);
  const orderedDate = createdAt.length ? new Date(Math.min(...createdAt)).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : null;
  const active = ["PAID", "IN_PREP", "READY"].includes(order.status);
  return <>
        <View style={orderReceiptStyles.hero}>
          <View style={orderReceiptStyles.brandIcon}><SymbolView name={{ ios: "bag", android: "shopping_bag" }} size={42} tintColor={uiPalette.primaryText} /></View>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={orderReceiptStyles.brand}>{brandName}</Text>
          {orderedDate ? <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={orderReceiptStyles.subtitle}>Ordered on {orderedDate}</Text> : null}
        </View>
        {active ? <View style={orderReceiptStyles.card}><ReceiptField label="Pickup code" value={order.pickupCode} last /><OrderProgress status={order.status} /></View> : null}
        <View style={orderReceiptStyles.card}><Text allowFontScaling={false} maxFontSizeMultiplier={1} style={orderReceiptStyles.status}>{orderStatusLabel(order.status)}</Text></View>
        <View style={orderReceiptStyles.group}>
          {order.items.map((item, index) => {
            const menuItem = menuItemsById.get(item.itemId);
            const label = item.itemName?.trim() || menuItem?.name || item.itemId;
            return <View key={`${item.itemId}-${index}`}>
              {index > 0 ? <View style={orderReceiptStyles.separator} /> : null}
              <View style={orderReceiptStyles.item}>
                <OrderItemThumbnail label={label} imageUrl={menuItem?.imageUrl} size="small" style={orderReceiptStyles.thumbnail} fallbackSymbol={{ ios: "bag", android: "shopping_bag" }} />
                <View style={orderReceiptStyles.itemCopy}>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={orderReceiptStyles.itemName}>{label}</Text>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={orderReceiptStyles.subtitle}>{formatOrderItemDescription(item)}</Text>
                </View>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={orderReceiptStyles.body}>{formatUsd(item.lineTotalCents ?? item.unitPriceCents * item.quantity)}</Text>
              </View>
            </View>;
          })}
        </View>
        <View style={orderReceiptStyles.group}>
          <ReceiptField label="Pickup code" value={order.pickupCode} />
          <ReceiptField label="Order ID" value={order.id} />
          <ReceiptField label="Order total" value={formatUsd(order.total.amountCents)} last />
        </View>
        <View style={orderReceiptStyles.card}>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={orderReceiptStyles.subtitle}>Status note</Text>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={orderReceiptStyles.body}>{getLatestOrderTimelineNote(order)}</Text>
          {order.status === "CANCELED" ? <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={orderReceiptStyles.subtitle}>If you were charged, contact the shop for help with your payment.</Text> : null}
        </View>
        {order.refundSummary && order.refundSummary.state !== "NONE" ? <View style={orderReceiptStyles.card}>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={orderReceiptStyles.itemName}>Refund</Text>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={orderReceiptStyles.body}>{formatUsd(order.refundSummary.settledAmountCents)} refunded</Text>
        </View> : null}
        {reversals.length ? <View style={orderReceiptStyles.group}>
          <ReceiptField label="Loyalty returned" value={`${sumReturnedPoints(reversals)} points`} last />
          {reversals.map((entry) => <ReceiptField key={entry.id} label={formatOrderDateTime(entry.createdAt)} value={`${entry.points > 0 ? "+" : ""}${entry.points} pts`} last />)}
        </View> : null}
</>;
}

function ReceiptField({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <View style={orderReceiptStyles.field}>
    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={orderReceiptStyles.subtitle}>{label}</Text>
    <Text allowFontScaling={false} maxFontSizeMultiplier={1} selectable style={orderReceiptStyles.body}>{value}</Text>
    {!last ? <View style={orderReceiptStyles.fieldSeparator} /> : null}
  </View>;
}

export const orderReceiptStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" }, content: { paddingHorizontal: 16, gap: 28 },
  hero: { alignItems: "center", paddingBottom: 8, gap: 10 },
  brandIcon: { width: 82, height: 82, borderRadius: 23, backgroundColor: uiPalette.primary, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  brand: { fontSize: 25, fontWeight: "700", color: uiPalette.text },
  subtitle: { fontSize: 15, lineHeight: 21, color: uiPalette.textSecondary },
  body: { fontSize: 17, lineHeight: 23, color: uiPalette.text },
  status: { fontSize: 22, fontWeight: "700", color: uiPalette.text },
  group: { borderRadius: 26, backgroundColor: uiPalette.surfaceStrong, overflow: "hidden" },
  card: { borderRadius: 26, backgroundColor: uiPalette.surfaceStrong, padding: 18, gap: 6 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  thumbnail: { width: 58, height: 58, borderRadius: 14 }, itemCopy: { flex: 1, minWidth: 0, gap: 4 },
  itemName: { fontSize: 17, fontWeight: "600", color: uiPalette.text },
  separator: { height: StyleSheet.hairlineWidth, marginHorizontal: 16, backgroundColor: uiPalette.border },
  field: { paddingHorizontal: 16, paddingTop: 15, paddingBottom: 15, gap: 3 },
  fieldSeparator: { position: "absolute", bottom: 0, left: 16, right: 16, height: StyleSheet.hairlineWidth, backgroundColor: uiPalette.border },
  message: { paddingVertical: 24, gap: 16 }
});
