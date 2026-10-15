import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type LoyaltyLedgerEntry, type OrderHistoryEntry, useLoyaltyLedgerQuery, useOrderHistoryQuery } from "../../src/account/data";
import { useAuthSession } from "../../src/auth/session";
import { formatUsd } from "../../src/menu/catalog";
import {
  findLatestOrderTime,
  findRefundEntriesForOrder,
  formatOrderDateTime,
  formatOrderReference,
  formatOrderStatus,
  getLatestOrderTimelineNote
} from "../../src/orders/history";
import { Button, uiPalette, uiTypography } from "../../src/ui/system";

function sumReturnedPoints(entries: LoyaltyLedgerEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.points, 0);
}

function canUseLiquidGlassStatusPill() {
  if (Platform.OS !== "ios") return false;

  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
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
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: OrderHistoryEntry["status"] }) {
  const useLiquidGlass = canUseLiquidGlassStatusPill();

  return (
    <View style={styles.statusBadgeShell}>
      {useLiquidGlass ? (
        <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.statusBadgeFrame} />
      ) : (
        <BlurView tint="light" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.statusBadgeFrame} />
      )}
      <View pointerEvents="none" style={styles.statusBadgeContent}>
        <Text style={[styles.statusBadgeText, styles.statusBadgeTextGlass]}>{formatOrderStatus(status)}</Text>
      </View>
    </View>
  );
}

function EmptyState({
  title,
  actionLabel,
  onAction
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <View style={styles.screen}>
      <View style={[styles.handleWrap, styles.handleWrapTop]}>
        <View style={styles.handle} />
      </View>
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Button label={actionLabel} onPress={onAction} style={styles.emptyAction} />
      </View>
    </View>
  );
}

export default function OrderDetailRoute() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string | string[] }>();
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const { isAuthenticated } = useAuthSession();
  const ordersQuery = useOrderHistoryQuery(isAuthenticated);
  const loyaltyLedgerQuery = useLoyaltyLedgerQuery(isAuthenticated);

  const order = useMemo(
    () => (orderId ? (ordersQuery.data ?? []).find((entry) => entry.id === orderId) ?? null : null),
    [orderId, ordersQuery.data]
  );
  const refundEntries = useMemo(
    () => (orderId ? findRefundEntriesForOrder(orderId, loyaltyLedgerQuery.data ?? []) : []),
    [loyaltyLedgerQuery.data, orderId]
  );
  const returnedPoints = useMemo(() => sumReturnedPoints(refundEntries), [refundEntries]);
  const hasRefundDetails = refundEntries.length > 0 || order?.status === "CANCELED";

  function goBackToOrders() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/(tabs)/orders");
  }

  if (!isAuthenticated) {
    return (
      <EmptyState
        title="Sign in to view this order."
        actionLabel="Sign In"
        onAction={() => router.push({ pathname: "/auth", params: { returnTo: "/(tabs)/orders" } })}
      />
    );
  }

  if (ordersQuery.isLoading && !ordersQuery.data) {
    return <EmptyState title="Loading order details…" actionLabel="Back to Orders" onAction={goBackToOrders} />;
  }

  if (!order) {
    return <EmptyState title="Order not found." actionLabel="Back to Orders" onAction={goBackToOrders} />;
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.handleWrap, styles.handleWrapTop]}>
        <View style={styles.handle} />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 28,
            paddingBottom: Math.max(insets.bottom, 12) + 20
          }
        ]}
      >
        <View style={styles.hero}>
          <Text style={styles.kicker}>Order details</Text>
          <View style={styles.heroHeader}>
            <Text style={styles.title}>{formatOrderReference(order.id)}</Text>
            <StatusBadge status={order.status} />
          </View>
          <Text style={styles.subtitle}>{formatOrderDateTime(findLatestOrderTime(order))}</Text>
        </View>

        <View style={styles.section}>
          <DetailRow label="Order ref" value={formatOrderReference(order.id)} />
          <DetailRow label="Total" value={formatUsd(order.total.amountCents)} />
          <DetailRow label="Updated" value={formatOrderDateTime(findLatestOrderTime(order))} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Pickup code</Text>
          <Text style={styles.pickupCode}>{order.pickupCode}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Status note</Text>
          <Text style={styles.note}>{getLatestOrderTimelineNote(order)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Items</Text>
          <View style={styles.itemList}>
            {order.items.map((item, index) => {
              const label = item.itemName?.trim() || item.itemId;
              const lineTotal = item.lineTotalCents ?? item.unitPriceCents * item.quantity;

              return (
                <View key={`${order.id}-${item.itemId}-${index}`} style={styles.itemRow}>
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemName}>
                      <Text style={styles.itemQuantity}>{`${item.quantity} x `}</Text>
                      {label}
                    </Text>
                  </View>
                  <Text style={styles.itemAmount}>{formatUsd(lineTotal)}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {hasRefundDetails ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Refund details</Text>
            {refundEntries.length > 0 ? (
              <>
                <Text style={styles.note}>{returnedPoints > 0 ? `${returnedPoints} points returned to the account.` : "Refund activity recorded."}</Text>
                <View style={styles.refundList}>
                  {refundEntries.map((entry) => (
                    <View key={entry.id} style={styles.refundRow}>
                      <View style={styles.refundCopy}>
                        <Text style={styles.refundTitle}>Refund posted</Text>
                        <Text style={styles.refundMeta}>{formatOrderDateTime(entry.createdAt)}</Text>
                      </View>
                      <Text style={styles.refundPoints}>{`${entry.points > 0 ? "+" : ""}${entry.points} pts`}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.note}>Refund activity will appear here once it is posted.</Text>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: uiPalette.surfaceStrong
  },
  handleWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10
  },
  handleWrapTop: {
    paddingTop: 10
  },
  handle: {
    width: 38,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(151, 160, 154, 0.52)"
  },
  content: {
    paddingHorizontal: 20
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
    borderWidth: 1
  },
  statusBadgeShell: {
    position: "relative",
    alignSelf: "flex-start",
    borderRadius: 999,
    overflow: "hidden"
  },
  statusBadgeFrame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    overflow: "hidden"
  },
  statusBadgeContent: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999
  },
  statusBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "700"
  },
  statusBadgeTextGlass: {
    color: uiPalette.text
  },
  section: {
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border
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
  itemQuantity: {
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
  emptyWrap: {
    flex: 1,
    backgroundColor: uiPalette.surfaceStrong,
    paddingHorizontal: 20,
    justifyContent: "center"
  },
  emptyTitle: {
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.4,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "700"
  },
  emptyAction: {
    marginTop: 18,
    alignSelf: "flex-start"
  }
});
