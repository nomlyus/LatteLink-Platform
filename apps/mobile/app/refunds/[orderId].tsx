import { useRouter, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { OrderItemThumbnail } from "../../src/components/OrderItemThumbnail";
import type { LoyaltyLedgerEntry, OrderHistoryEntry } from "../../src/account/data";
import { useLoyaltyLedgerQuery, useOrderHistoryQuery } from "../../src/account/data";
import { useAuthSession } from "../../src/auth/session";
import { GlassActionPill } from "../../src/cart/GlassActionPill";
import { formatUsd, resolveMenuData, useMenuQuery, type MenuItem } from "../../src/menu/catalog";
import { findLoyaltyReversalEntriesForOrder } from "../../src/orders/history";
import { formatOrderItemDescription, sumReturnedPoints } from "../../src/orders/presentation";
import { Button, ScreenScroll, uiPalette, uiTypography } from "../../src/ui/system";
import { SummaryStatusPill, SummaryRow } from "../../src/orders/RefundPrimitives";

function buildHeadline(order: OrderHistoryEntry, loyaltyReversalEntries: LoyaltyLedgerEntry[]) {
  if (order.status === "CANCELED") {
    return {
      title: "Canceled Order"
    };
  }

  if (loyaltyReversalEntries.length > 0) {
    return {
      title: "Loyalty Points Returned"
    };
  }

  return {
    title: "Order Updated"
  };
}

function EmptyState({ title, actionLabel, onAction }: { title: string; actionLabel: string; onAction: () => void }) {
  return (
    <ScreenScroll bottomInset={48}>
      <View style={styles.emptyWrap}>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.emptyTitle}>
          {title}
        </Text>
        <Button
          label={actionLabel}
          onPress={onAction}
          style={{ marginTop: 18, alignSelf: "flex-start" }}
          left={<Ionicons name="arrow-forward" size={16} color={uiPalette.primaryText} />}
        />
      </View>
    </ScreenScroll>
  );
}

export default function RefundDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string | string[] }>();
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const { isAuthenticated } = useAuthSession();
  const shouldLoadLiveData = isAuthenticated;
  const ordersQuery = useOrderHistoryQuery(shouldLoadLiveData);
  const loyaltyLedgerQuery = useLoyaltyLedgerQuery(shouldLoadLiveData);
  const menuQuery = useMenuQuery();
  const menu = resolveMenuData(menuQuery.data);
  const menuItemsById = useMemo(
    () =>
      new Map((menu?.categories ?? []).flatMap((category) => category.items).map((item) => [item.id, item] as const)),
    [menu?.categories]
  );

  const order = (ordersQuery.data ?? []).find((entry) => entry.id === orderId);
  const loyaltyReversalEntries = orderId
    ? findLoyaltyReversalEntriesForOrder(orderId, loyaltyLedgerQuery.data ?? [])
    : [];

  const headline = order ? buildHeadline(order, loyaltyReversalEntries) : null;
  const returnedPoints = useMemo(() => sumReturnedPoints(loyaltyReversalEntries), [loyaltyReversalEntries]);

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

  if (!order) {
    return <EmptyState title="Order not found." actionLabel="Back to Orders" onAction={goBackToOrders} />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.mainContent}>
          <View style={styles.heroBlock}>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.title}>
              {headline?.title}
            </Text>
          </View>

          <View style={styles.orderItemsStage}>
            <View style={styles.orderItemsBlock}>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.orderItemsLabel}>
                Items
              </Text>
              {order.items.map((item, index) => {
                const menuItem = menuItemsById.get(item.itemId) as MenuItem | undefined;
                const label = item.itemName ?? menuItem?.name ?? item.itemId;
                const description = formatOrderItemDescription(item, menuItem);
                const lineTotal = item.lineTotalCents ?? item.unitPriceCents * item.quantity;

                return (
                  <View key={`${item.itemId}-${index}`} style={styles.menuLikeRow}>
                    <View style={styles.menuLikeRowMain}>
                      <OrderItemThumbnail label={label} imageUrl={menuItem?.imageUrl} style={styles.menuLikeImage} />
                      <View
                        style={[
                          styles.menuLikeBodyWrap,
                          index < order.items.length - 1 ? styles.menuLikeBodyWrapWithDivider : null
                        ]}
                      >
                        <View style={styles.menuLikeBodyContent}>
                          <View style={styles.menuLikeCopy}>
                            <View style={styles.menuLikeTitleRow}>
                              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.menuLikeTitle}>
                                {label}
                              </Text>
                              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.menuLikeMeta}>
                                {formatUsd(lineTotal)}
                              </Text>
                            </View>
                            <Text
                              allowFontScaling={false}
                              maxFontSizeMultiplier={1}
                              numberOfLines={3}
                              style={styles.menuLikeDescription}
                            >
                              {description}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.summarySection}>
            <SummaryRow label="Status" value={<SummaryStatusPill status={order.status} />} />
            <SummaryRow label="Total" value={formatUsd(order.total.amountCents)} emphasized />
            <SummaryRow
              label="Loyalty points returned"
              value={returnedPoints > 0 ? `${returnedPoints} pts` : "--"}
              emphasized
            />
          </View>

          {order.status === "CANCELED" ? (
            <View style={styles.paymentSupportSection}>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.paymentSupportLabel}>
                Payment support
              </Text>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.paymentSupportCopy}>
                If you were charged, contact the shop for help with your payment.
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.footerContent, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <GlassActionPill label="Back to Orders" onPress={goBackToOrders} tone="dark" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: uiPalette.surfaceStrong
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    justifyContent: "space-between"
  },
  mainContent: {
    flex: 1
  },
  heroBlock: {
    paddingTop: 2,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border
  },
  title: {
    marginTop: 2,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  },
  orderItemsStage: {
    flex: 1,
    justifyContent: "center"
  },
  orderItemsBlock: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    paddingTop: 2,
    paddingBottom: 18
  },
  orderItemsLabel: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: uiPalette.textMuted,
    fontWeight: "700",
    textAlign: "left"
  },
  menuLikeRow: {
    minHeight: 132
  },
  menuLikeRowMain: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    width: "100%"
  },
  menuLikeImage: {
    width: 108,
    height: 132,
    borderRadius: 0,
    backgroundColor: "#D5D4CE",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  menuLikeBodyWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: 132,
    justifyContent: "center"
  },
  menuLikeBodyWrapWithDivider: {
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border
  },
  menuLikeBodyContent: {
    minHeight: 132,
    justifyContent: "center",
    paddingVertical: 10
  },
  menuLikeCopy: {
    justifyContent: "center",
    gap: 1
  },
  menuLikeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  menuLikeTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "500"
  },
  menuLikeDescription: {
    fontSize: 12,
    lineHeight: 14,
    color: uiPalette.textSecondary
  },
  menuLikeMeta: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "400"
  },
  summarySection: {
    paddingTop: 2
  },
  paymentSupportSection: {
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: uiPalette.border
  },
  paymentSupportLabel: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: uiPalette.textMuted,
    fontWeight: "700"
  },
  paymentSupportCopy: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.textSecondary
  },
  footerContent: {
    marginTop: "auto",
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: uiPalette.border,
    gap: 12
  },
  emptyWrap: {
    marginTop: 22
  },
  emptyTitle: {
    marginTop: 2,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  }
});
