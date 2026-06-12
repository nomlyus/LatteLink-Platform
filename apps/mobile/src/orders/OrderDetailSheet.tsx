import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMemo, useRef, type ComponentRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { LoyaltyLedgerEntry, OrderHistoryEntry } from "../account/data";
import { GlassActionPill } from "../cart/GlassActionPill";
import { formatUsd } from "../menu/catalog";
import { findLatestOrderTime, formatOrderDateTime, formatOrderReference, formatOrderStatus, getLatestOrderTimelineNote } from "./history";
import { uiPalette, uiTypography } from "../ui/system";

type OrderDetailSheetProps = {
  order: OrderHistoryEntry;
  refundEntries: LoyaltyLedgerEntry[];
  bottomInset: number;
  onClose: () => void;
};

function getStatusTone(status: OrderHistoryEntry["status"]) {
  switch (status) {
    case "PENDING_PAYMENT":
      return {
        backgroundColor: "rgba(164, 108, 44, 0.08)",
        borderColor: "rgba(164, 108, 44, 0.18)",
        textColor: uiPalette.warning
      };
    case "READY":
      return {
        backgroundColor: "rgba(79, 122, 99, 0.1)",
        borderColor: "rgba(79, 122, 99, 0.22)",
        textColor: uiPalette.success
      };
    case "CANCELED":
      return {
        backgroundColor: "rgba(180, 91, 79, 0.08)",
        borderColor: "rgba(180, 91, 79, 0.18)",
        textColor: uiPalette.danger
      };
    case "COMPLETED":
      return {
        backgroundColor: "rgba(23, 21, 19, 0.05)",
        borderColor: "rgba(23, 21, 19, 0.1)",
        textColor: uiPalette.textSecondary
      };
    case "PAID":
    case "IN_PREP":
    default:
      return {
        backgroundColor: uiPalette.accentSoft,
        borderColor: "rgba(30, 27, 24, 0.1)",
        textColor: uiPalette.accent
      };
  }
}

function sumReturnedPoints(entries: LoyaltyLedgerEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.points, 0);
}

function DetailRow({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.detailLabel}>{label}</Text>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: OrderHistoryEntry["status"] }) {
  const tone = getStatusTone(status);

  return (
    <View style={[styles.statusBadge, { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor }]}>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={[styles.statusBadgeText, { color: tone.textColor }]}>{formatOrderStatus(status)}</Text>
    </View>
  );
}

export function OrderDetailSheet({ order, refundEntries, bottomInset, onClose }: OrderDetailSheetProps) {
  const sheetRef = useRef<ComponentRef<typeof BottomSheet>>(null);
  const snapPoints = useMemo(() => ["82%"], []);
  const latestNote = getLatestOrderTimelineNote(order);
  const returnedPoints = useMemo(() => sumReturnedPoints(refundEntries), [refundEntries]);
  const hasRefundDetails = refundEntries.length > 0 || order.status === "CANCELED";

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      animateOnMount
      enablePanDownToClose
      onChange={(index) => {
        if (index === -1) {
          onClose();
        }
      }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.36} pressBehavior="close" />
      )}
      backgroundStyle={styles.sheet}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(bottomInset, 12) }]}
      >
        <View style={styles.hero}>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.kicker}>Order details</Text>
          <View style={styles.heroHeader}>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.title}>{formatOrderReference(order.id)}</Text>
            <StatusBadge status={order.status} />
          </View>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.subtitle}>{formatOrderDateTime(findLatestOrderTime(order))}</Text>
        </View>

        <View style={styles.section}>
          <DetailRow label="Order ref" value={formatOrderReference(order.id)} />
          <DetailRow label="Total" value={formatUsd(order.total.amountCents)} />
          <DetailRow label="Updated" value={formatOrderDateTime(findLatestOrderTime(order))} />
        </View>

        <View style={styles.pickupSection}>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionLabel}>Pickup code</Text>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.pickupCode}>{order.pickupCode}</Text>
        </View>

        <View style={styles.section}>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionLabel}>Status note</Text>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.note}>{latestNote}</Text>
        </View>

        <View style={styles.section}>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionLabel}>Items</Text>
          <View style={styles.itemList}>
            {order.items.map((item, index) => {
              const label = item.itemName?.trim() || item.itemId;
              const lineTotal = item.lineTotalCents ?? item.unitPriceCents * item.quantity;

              return (
                <View key={`${order.id}-${item.itemId}-${index}`} style={styles.itemRow}>
                  <View style={styles.itemCopy}>
                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.itemName}>{label}</Text>
                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.itemMeta}>{`${item.quantity}x`}</Text>
                  </View>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.itemAmount}>{formatUsd(lineTotal)}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {hasRefundDetails ? (
          <View style={styles.section}>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionLabel}>Refund details</Text>
            {refundEntries.length > 0 ? (
              <>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.note}>{returnedPoints > 0 ? `${returnedPoints} points returned to the account.` : "Refund activity recorded."}</Text>
                <View style={styles.refundList}>
                  {refundEntries.map((entry) => (
                    <View key={entry.id} style={styles.refundRow}>
                      <View style={styles.refundCopy}>
                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.refundTitle}>Refund posted</Text>
                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.refundMeta}>{formatOrderDateTime(entry.createdAt)}</Text>
                      </View>
                      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.refundPoints}>{`${entry.points > 0 ? "+" : ""}${entry.points} pts`}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.note}>Refund activity will appear here once it is posted.</Text>
            )}
          </View>
        ) : null}

        <View style={styles.actions}>
          <GlassActionPill label="Close" onPress={onClose} tone="dark" />
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: uiPalette.surfaceStrong,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: uiPalette.borderStrong
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24
  },
  hero: {
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border
  },
  kicker: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: uiPalette.textMuted,
    fontWeight: "700"
  },
  heroHeader: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  title: {
    flexShrink: 1,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.8,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "700"
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.textSecondary
  },
  statusBadge: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: uiPalette.accent,
    fontWeight: "700"
  },
  section: {
    paddingTop: 18,
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border,
    paddingBottom: 18
  },
  pickupSection: {
    paddingTop: 18,
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border,
    paddingBottom: 18
  },
  sectionLabel: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: uiPalette.textMuted,
    fontWeight: "700"
  },
  detailRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 18
  },
  detailLabel: {
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.textSecondary
  },
  detailValue: {
    flexShrink: 1,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  },
  pickupCode: {
    marginTop: 8,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: 1.2,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "700"
  },
  note: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 23,
    color: uiPalette.textSecondary
  },
  itemList: {
    marginTop: 12,
    gap: 12
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 16
  },
  itemCopy: {
    flex: 1,
    minWidth: 0
  },
  itemName: {
    fontSize: 15,
    lineHeight: 21,
    color: uiPalette.text,
    fontWeight: "600"
  },
  itemMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
    color: uiPalette.textSecondary
  },
  itemAmount: {
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "400"
  },
  refundList: {
    marginTop: 12,
    gap: 12
  },
  refundRow: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(23, 21, 19, 0.04)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  refundCopy: {
    flex: 1,
    minWidth: 0
  },
  refundTitle: {
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.text,
    fontWeight: "600"
  },
  refundMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
    color: uiPalette.textSecondary
  },
  refundPoints: {
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.text,
    fontFamily: uiTypography.monoFamily,
    fontWeight: "600"
  },
  actions: {
    paddingTop: 18
  }
});
