import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NativeGlassSurface } from "../ui/NativeGlassSurface";
import type { ReactNode } from "react";
import { OrderItemThumbnail, OrderStatusPill } from "../components";
import { formatUsd } from "../menu/catalog";
import type { MenuItem } from "../menu/catalog";
import type { OrderHistoryEntry } from "../account/data";
import { buildOrderItemsSummary, countOrderUnits } from "./presentation";
import { findLatestOrderTime, formatOrderDateTime, formatOrderReference } from "./history";
import { uiPalette, uiTypography } from "../ui/system";

function OrderHistoryItemThumbnail({
  item,
  menuItemsById,
  stacked = false
}: {
  item: OrderHistoryEntry["items"][number];
  menuItemsById: Map<string, MenuItem>;
  stacked?: boolean;
}) {
  const menuItem = menuItemsById.get(item.itemId);
  const label = item.itemName?.trim() || menuItem?.name || "Item";
  return (
    <OrderItemThumbnail
      label={label}
      imageUrl={menuItem?.imageUrl}
      size="small"
      fallbackSymbol={{ ios: "bag", android: "shopping_bag" }}
      style={[styles.orderThumb, stacked ? styles.orderThumbStacked : null]}
    />
  );
}

export function OrderItemStrip({
  order,
  menuItemsById
}: {
  order: OrderHistoryEntry;
  menuItemsById: Map<string, MenuItem>;
}) {
  const previewItems = order.items.slice(0, 3);
  const remainingItemTypes = order.items.length - previewItems.length;
  const totalUnits = countOrderUnits(order);

  return (
    <View style={styles.orderItemsRow}>
      <View style={styles.orderThumbStack}>
        {previewItems.length > 0 ? (
          previewItems.map((item, index) => (
            <OrderHistoryItemThumbnail
              key={`${order.id}-${item.itemId}-${index}`}
              item={item}
              menuItemsById={menuItemsById}
              stacked={index > 0}
            />
          ))
        ) : (
          <View style={styles.orderThumb}>
            <SymbolView name={{ ios: "receipt", android: "receipt" }} size={16} tintColor={uiPalette.textSecondary} />
          </View>
        )}
        {remainingItemTypes > 0 ? (
          <View style={[styles.orderThumb, styles.orderThumbStacked, styles.orderThumbCount]}>
            <Text
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              style={styles.orderThumbCountText}
            >{`+${remainingItemTypes}`}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.orderItemsCopy}>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.orderItemsTitle}>
          {buildOrderItemsSummary(order, menuItemsById)}
        </Text>
        <Text
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          style={styles.orderItemsMeta}
        >{`${totalUnits} item${totalUnits === 1 ? "" : "s"}`}</Text>
      </View>
    </View>
  );
}

export function ActiveOrderPill({ children }: { children: ReactNode }) {
  return <View style={styles.activePanelShell}><NativeGlassSurface style={styles.activePanelFrame}
    contentStyle={styles.activePanelInner}>{children}</NativeGlassSurface></View>;
}

export function HistoryRow({
  order,
  menuItemsById,
  onPress
}: {
  order: OrderHistoryEntry;
  menuItemsById: Map<string, MenuItem>;
  onPress: () => void;
}) {
  const previewItems = order.items.slice(0, 3);
  const remainingItemTypes = order.items.length - previewItems.length;
  const totalUnits = countOrderUnits(order);
  const historyStatus = order.status === "CANCELED" ? "CANCELED" : "COMPLETED";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open details for order ${formatOrderReference(order.id)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.historyRow, pressed ? styles.historyRowPressed : null]}
    >
      <View style={styles.historyContentRow}>
        <View style={styles.historyThumbStack}>
          {previewItems.length > 0 ? (
            previewItems.map((item, index) => (
              <OrderHistoryItemThumbnail
                key={`${order.id}-${item.itemId}-${index}`}
                item={item}
                menuItemsById={menuItemsById}
                stacked={index > 0}
              />
            ))
          ) : (
            <View style={styles.orderThumb}>
              <SymbolView name={{ ios: "receipt", android: "receipt" }} size={16} tintColor={uiPalette.textSecondary} />
            </View>
          )}
          {remainingItemTypes > 0 ? (
            <View style={[styles.orderThumb, styles.orderThumbStacked, styles.orderThumbCount]}>
              <Text
                allowFontScaling={false}
                maxFontSizeMultiplier={1}
                style={styles.orderThumbCountText}
              >{`+${remainingItemTypes}`}</Text>
            </View>
          ) : null}
        </View>
        <OrderStatusPill status={historyStatus} glassStyle="regular" />
      </View>
      <View style={[styles.orderItemsCopy, styles.historyCopy]}>
        <View style={styles.historyTitleRow}>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={[styles.orderItemsTitle, styles.historyTitle]}>
            {buildOrderItemsSummary(order, menuItemsById)}
          </Text>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.historyAmount}>
            {formatUsd(order.total.amountCents)}
          </Text>
        </View>
        <Text
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          style={styles.orderItemsMeta}
        >{`${totalUnits} item${totalUnits === 1 ? "" : "s"}`}</Text>
      </View>
      <View style={styles.historyMetaRow}>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.historyMeta}>
          {formatOrderDateTime(findLatestOrderTime(order))}
        </Text>
        <View style={styles.historyMetaAction}>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.historyMetaActionText}>
            Details
          </Text>
          <SymbolView name={{ ios: "chevron.right", android: "chevron_right" }} size={14} tintColor={uiPalette.textSecondary} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  activePanelShell: {},
  activePanelFrame: {},
  activePanelInner: {
    padding: 22
  },
  orderItemsRow: {
    marginTop: 12,
    alignItems: "flex-start"
  },
  orderThumbStack: {
    flexDirection: "row",
    alignItems: "center"
  },
  orderThumb: {
    width: 42,
    height: 52,
    borderRadius: 0,
    overflow: "hidden",
    backgroundColor: uiPalette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center"
  },
  orderThumbStacked: {
    marginLeft: -8
  },
  orderThumbCount: {
    backgroundColor: uiPalette.surfaceMuted
  },
  orderThumbCountText: {
    fontSize: 12,
    lineHeight: 16,
    color: uiPalette.text,
    fontWeight: "700"
  },
  orderItemsCopy: {
    marginTop: 10,
    maxWidth: 320
  },
  orderItemsTitle: {
    fontSize: 16,
    lineHeight: 21,
    color: uiPalette.text,
    fontWeight: "600"
  },
  orderItemsMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
    color: uiPalette.textSecondary
  },
  historyRow: {
    paddingVertical: 18,
    paddingHorizontal: 2,
    borderRadius: 20
  },
  historyRowPressed: {
    opacity: 0.78
  },
  historyTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12
  },
  historyTitle: { flex: 1, minWidth: 0 },
  historyCopy: { maxWidth: "100%", alignSelf: "stretch" },
  historyAmount: {
    flexShrink: 0,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "400"
  },
  historyContentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  historyThumbStack: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    minWidth: 0
  },
  historyMetaRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  historyMeta: {
    fontSize: 13,
    lineHeight: 19,
    color: uiPalette.textSecondary
  },
  historyMetaAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  historyMetaActionText: {
    fontSize: 13,
    lineHeight: 16,
    color: uiPalette.textMuted,
    fontWeight: "600"
  }
});
