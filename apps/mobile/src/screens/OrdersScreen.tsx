import { useRefresh } from "../ui/useRefresh";
import { useInitialReveal } from "../ui/useInitialReveal";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Animated as RNAnimated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { findActiveOrder, useCancelOrderMutation, useOrderHistoryQuery, type OrderHistoryEntry } from "../account/data";
import { formatUsd, resolveAppConfigData, useAppConfigQuery } from "../menu/catalog";
import { OrderStatusPill, SectionHeader } from "../components";
import { getOrdersRecoveryCopy } from "../auth/recovery";
import { useAuthSession } from "../auth/session";
import { resolveMenuData, useMenuQuery } from "../menu/catalog";
import { getTabBarBottomOffset, TAB_BAR_HEIGHT } from "../navigation/tabBarMetrics";
import { useCheckoutFlow } from "../orders/flow";
import { OrdersLoadingState } from "../orders/OrdersLoadingState";
import { ActiveOrderPill, HistoryRow, OrderItemStrip } from "../orders/OrdersHistoryPrimitives";
import { Button, ScreenScroll, ScreenStatic, uiPalette, uiTypography } from "../ui/system";
import { OrderProgress } from "../orders/OrderProgress";

const ORDERS_HEADER_HEIGHT = 52;

function getActiveOrderTitle(status: OrderHistoryEntry["status"]) {
  switch (status) {
    case "PENDING_PAYMENT":
      return "Waiting for payment to start the order.";
    case "PAID":
      return "Confirmed";
    case "IN_PREP":
      return "In Preparation";
    case "READY":
      return "Ready for Pickup";
    default:
      return "Your current order is in motion.";
  }
}

function getActiveOrderBody(status: OrderHistoryEntry["status"]) {
  switch (status) {
    case "PENDING_PAYMENT":
      return "Complete payment to lock the order and move it into prep.";
    case "PAID":
      return "Your order has been confirmed and will start prep shortly.";
    case "IN_PREP":
      return "Your order is currently being prepared by our team.";
    case "READY":
      return "Bring the pickup code to the counter and our team will hand it over.";
    default:
      return "Status changes and pickup details update here automatically.";
  }
}

function OrdersHeader({ title, foregroundColor }: { title: string; foregroundColor?: string }) {
  return (
    <>
      <View style={styles.pageHeader}>
        <View style={styles.pageCopy}>
          <View style={styles.pageMetaSpacer} />
          <Text
            allowFontScaling={false}
            maxFontSizeMultiplier={1}
            style={[styles.pageTitle, foregroundColor ? { color: foregroundColor } : null]}
          >
            {title}
          </Text>
        </View>
      </View>
      <View style={styles.pageTabsSpacer} />
    </>
  );
}

export function OrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isHydrating, authRecoveryState } = useAuthSession();
  const appConfig = resolveAppConfigData(useAppConfigQuery().data);
  const { clearFailure, clearRetryOrder } = useCheckoutFlow();
  const ordersQuery = useOrderHistoryQuery(isAuthenticated);
  const cancelOrderMutation = useCancelOrderMutation();
  const menuQuery = useMenuQuery();
  const { loadingOpacity, showLoadingOverlay } = useInitialReveal(
    isHydrating || (isAuthenticated && ordersQuery.isLoading && !ordersQuery.data),
    { initiallyVisible: false }
  );
  const { refreshing: isManualRefresh, refresh: refreshOrders } = useRefresh([ordersQuery.refetch]);
  const [pendingCancelError, setPendingCancelError] = useState<string | null>(null);

  const orders = ordersQuery.data ?? [];
  const menu = resolveMenuData(menuQuery.data);
  const menuItemsById = useMemo(
    () => new Map((menu?.categories ?? []).flatMap((category) => category.items).map((item) => [item.id, item])),
    [menu?.categories]
  );
  const realActiveOrder = findActiveOrder(orders);
  const activeOrder = realActiveOrder;
  const activeOrderStatus = activeOrder?.status;
  const orderHistory = activeOrder ? orders.filter((order) => order.id !== activeOrder.id) : orders;
  const headerOffset = insets.top + ORDERS_HEADER_HEIGHT;
  const contentBottomInset = Math.max(
    getTabBarBottomOffset(insets.bottom > 0) + TAB_BAR_HEIGHT + 24 - insets.bottom,
    24
  );
  const staticBottomInset = getTabBarBottomOffset(insets.bottom > 0) + TAB_BAR_HEIGHT + 12;
  const recoveryCopy = getOrdersRecoveryCopy(authRecoveryState);
  const headerBackgroundColor = appConfig?.header.background ?? uiPalette.background;
  const headerForegroundColor = appConfig?.header.foreground ?? uiPalette.text;

  useEffect(() => {
    if ((activeOrderStatus ?? activeOrder?.status) !== "PENDING_PAYMENT") {
      setPendingCancelError(null);
    }
  }, [activeOrder?.id, activeOrder?.status, activeOrderStatus]);

  const cancelPendingPaymentOrder = async () => {
    if (
      !activeOrder ||
      (activeOrderStatus ?? activeOrder.status) !== "PENDING_PAYMENT" ||
      cancelOrderMutation.isPending
    ) {
      return;
    }

    try {
      setPendingCancelError(null);
      await cancelOrderMutation.mutateAsync({
        orderId: activeOrder.id,
        reason: "Customer canceled unpaid order"
      });
      clearRetryOrder();
      clearFailure();
    } catch (error) {
      setPendingCancelError(error instanceof Error ? error.message : "Unable to cancel the unpaid order.");
    }
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.screenShell}>
        <ScreenStatic
          style={[styles.loggedOutStaticPage, { paddingTop: headerOffset, paddingBottom: staticBottomInset }]}
        >
          <View style={styles.loggedOutStaticBody}>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.loggedOutStaticTitle}>
              {recoveryCopy.title}
            </Text>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.loggedOutStaticText}>
              {recoveryCopy.body}
            </Text>
          </View>
        </ScreenStatic>

        <View
          pointerEvents="none"
          style={[
            styles.pageHeaderFloating,
            {
              paddingTop: insets.top,
              height: insets.top + ORDERS_HEADER_HEIGHT,
              backgroundColor: headerBackgroundColor
            }
          ]}
        >
          <OrdersHeader title="Orders" foregroundColor={headerForegroundColor} />
        </View>

        {showLoadingOverlay ? (
          <RNAnimated.View pointerEvents="auto" style={[styles.loadingOverlay, { opacity: loadingOpacity }]}>
            <OrdersLoadingState headerHeight={ORDERS_HEADER_HEIGHT} contentBottomInset={contentBottomInset} />
          </RNAnimated.View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.screenShell}>
      <ScreenScroll
        bottomInset={contentBottomInset}
        refreshing={isManualRefresh}
        onRefresh={refreshOrders}
        contentContainerStyle={[styles.screenContentNoTopPadding, { paddingTop: headerOffset }]}
      >
        {activeOrder ? (
          <View style={styles.sectionBlock}>
            <ActiveOrderPill>
              <View style={styles.activeTopRow}>
                <OrderStatusPill status={activeOrderStatus ?? activeOrder.status} glassStyle="clear" />
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.activeAmount}>
                  {formatUsd(activeOrder.total.amountCents)}
                </Text>
              </View>

              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.activeTitle}>
                {getActiveOrderTitle(activeOrderStatus ?? activeOrder.status)}
              </Text>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.activeBody}>
                {getActiveOrderBody(activeOrderStatus ?? activeOrder.status)}
              </Text>

              <OrderItemStrip order={activeOrder} menuItemsById={menuItemsById} />

              <View style={styles.pickupCodeBlock}>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.metricLabel}>
                  Pickup code
                </Text>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.pickupCodeValue}>
                  {activeOrder.pickupCode}
                </Text>
              </View>

              <OrderProgress status={activeOrderStatus ?? activeOrder.status} />

              {(activeOrderStatus ?? activeOrder.status) === "PENDING_PAYMENT" ? (
                <View style={styles.paymentActionGroup}>
                  <Button
                    label="Complete Payment"
                    onPress={() => router.push("/cart")}
                    style={styles.paymentButton}
                    left={<Ionicons name="logo-apple" size={16} color={uiPalette.primaryText} />}
                  />
                  <Button
                    label={cancelOrderMutation.isPending ? "Canceling…" : "Cancel Order"}
                    variant="secondary"
                    disabled={cancelOrderMutation.isPending}
                    onPress={() => {
                      void cancelPendingPaymentOrder();
                    }}
                    style={styles.paymentButton}
                  />
                  {pendingCancelError ? (
                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.pendingCancelError}>
                      {pendingCancelError}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </ActiveOrderPill>
          </View>
        ) : null}

        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <SectionHeader
              label="Recent orders"
              action={
                !ordersQuery.isLoading && !ordersQuery.error ? (
                  <Text
                    allowFontScaling={false}
                    maxFontSizeMultiplier={1}
                    style={styles.sectionMeta}
                  >{`${orderHistory.length} total`}</Text>
                ) : undefined
              }
            />
          </View>

          {ordersQuery.error ? (
            <View style={styles.sectionMessageBlock}>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionMessage}>
                Unable to load recent orders.
              </Text>
              <Button label="Retry" variant="secondary" onPress={refreshOrders} style={styles.sectionMessageAction} />
            </View>
          ) : null}
          {!ordersQuery.isLoading && !ordersQuery.error && orderHistory.length === 0 ? (
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionMessage}>
              Completed pickups and older orders will collect here.
            </Text>
          ) : null}

          {!ordersQuery.isLoading && !ordersQuery.error && orderHistory.length > 0 ? (
            <View style={styles.historyList}>
              {orderHistory.map((order, index) => (
                <View key={order.id}>
                  <HistoryRow
                    order={order}
                    menuItemsById={menuItemsById}
                    onPress={() => router.push({ pathname: "/orders/[orderId]", params: { orderId: order.id } })}
                  />
                  {index < orderHistory.length - 1 ? <View style={styles.historyDivider} /> : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </ScreenScroll>

      <View
        pointerEvents="none"
        style={[
          styles.pageHeaderFloating,
          { paddingTop: insets.top, height: insets.top + ORDERS_HEADER_HEIGHT, backgroundColor: headerBackgroundColor }
        ]}
      >
        <OrdersHeader
          title={activeOrder ? "Track your order" : "Past Orders"}
          foregroundColor={headerForegroundColor}
        />
      </View>

      {showLoadingOverlay ? (
        <RNAnimated.View pointerEvents="auto" style={[styles.loadingOverlay, { opacity: loadingOpacity }]}>
          <OrdersLoadingState headerHeight={ORDERS_HEADER_HEIGHT} contentBottomInset={contentBottomInset} />
        </RNAnimated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screenShell: {
    flex: 1
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    paddingBottom: 11
  },
  pageHeaderFloating: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    overflow: "hidden",
    justifyContent: "flex-end",
    zIndex: 10
  },
  pageCopy: {
    flex: 1
  },
  pageMetaSpacer: {
    height: 0,
    marginBottom: 0,
    overflow: "hidden"
  },
  pageTabsSpacer: {
    height: 0,
    marginTop: 0
  },
  pageTitle: {
    marginTop: 3,
    fontSize: 17,
    lineHeight: 18,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.headerFamily,
    fontWeight: "600"
  },
  screenContentNoTopPadding: {
    paddingTop: 0
  },
  loggedOutStaticPage: {
    flex: 1
  },
  loggedOutStaticBody: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: 18,
    paddingBottom: 32
  },
  loggedOutStaticTitle: {
    marginTop: 12,
    maxWidth: 320,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -1.1,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "700"
  },
  loggedOutStaticText: {
    marginTop: 12,
    maxWidth: 320,
    fontSize: 16,
    lineHeight: 24,
    color: uiPalette.textSecondary
  },
  sectionBlock: {
    marginTop: 28
  },
  sectionHeader: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  sectionMeta: {
    fontSize: 12,
    lineHeight: 18,
    color: uiPalette.textMuted
  },
  activeTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  activeAmount: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "400"
  },
  activeTitle: {
    marginTop: 18,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.9,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "700"
  },
  activeBody: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 24,
    color: uiPalette.textSecondary
  },
  pickupCodeBlock: {
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: uiPalette.border
  },
  metricLabel: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: uiPalette.textMuted,
    fontWeight: "700"
  },
  pickupCodeValue: {
    marginTop: 8,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: 1.2,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "700"
  },
  paymentButton: {
    alignSelf: "flex-start"
  },
  paymentActionGroup: {
    marginTop: 22,
    alignSelf: "stretch",
    gap: 12
  },
  pendingCancelError: {
    fontSize: 13,
    lineHeight: 19,
    color: uiPalette.danger
  },
  sectionMessage: {
    marginTop: 18,
    fontSize: 15,
    lineHeight: 23,
    color: uiPalette.textSecondary
  },
  sectionMessageBlock: {
    marginTop: 18,
    alignItems: "flex-start",
    gap: 12
  },
  sectionMessageAction: {
    alignSelf: "flex-start"
  },
  historyList: {
    marginTop: 8
  },
  historyDivider: {
    height: 1,
    marginVertical: 10,
    backgroundColor: uiPalette.border
  }
});
