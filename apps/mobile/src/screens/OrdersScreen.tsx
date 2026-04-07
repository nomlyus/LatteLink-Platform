import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated as RNAnimated, Image, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  findActiveOrder,
  orderHistoryQueryKey,
  sortOrdersByLatestActivity,
  useCancelOrderMutation,
  useOrderHistoryQuery,
  type OrderHistoryEntry
} from "../account/data";
import { apiClient } from "../api/client";
import { OrderStatusPill, SectionHeader } from "../components";
import { getOrdersRecoveryCopy } from "../auth/recovery";
import { useAuthSession } from "../auth/session";
import { formatUsd, resolveMenuData, useMenuQuery, type MenuItem } from "../menu/catalog";
import { getTabBarBottomOffset, TAB_BAR_HEIGHT } from "../navigation/tabBarMetrics";
import { useCheckoutFlow } from "../orders/flow";
import {
  findLatestOrderTime,
  formatOrderDateTime,
  formatOrderReference,
  getLatestOrderTimelineNote
} from "../orders/history";
import { OrdersLoadingState } from "../orders/OrdersLoadingState";
import { Button, ScreenScroll, ScreenStatic, uiPalette, uiTypography } from "../ui/system";

const ACTIVE_PROGRESS_STEPS = [
  { status: "PENDING_PAYMENT", label: "Payment" },
  { status: "PAID", label: "Confirmed" },
  { status: "IN_PREP", label: "In prep" },
  { status: "READY", label: "Ready" }
] as const satisfies Array<{ status: OrderHistoryEntry["status"]; label: string }>;

const ORDERS_HEADER_HEIGHT = 52;
const PROGRESS_ANIMATION_MS = 420;

function clampUnit(value: number) {
  "worklet";
  return Math.max(0, Math.min(1, value));
}

function canUseLiquidGlassPill() {
  if (Platform.OS !== "ios") return false;

  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

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

function resolveOrderItemIcon(name: string) {
  const haystack = name.toLowerCase();
  if (haystack.includes("tea") || haystack.includes("matcha")) return "leaf-outline" as const;
  if (
    haystack.includes("croissant") ||
    haystack.includes("cookie") ||
    haystack.includes("muffin") ||
    haystack.includes("pastry")
  ) {
    return "nutrition-outline" as const;
  }
  if (
    haystack.includes("latte") ||
    haystack.includes("espresso") ||
    haystack.includes("coffee") ||
    haystack.includes("cappuccino")
  ) {
    return "cafe-outline" as const;
  }

  return "sparkles-outline" as const;
}

function buildOrderItemsSummary(order: OrderHistoryEntry, menuItemsById: Map<string, MenuItem>) {
  const names = order.items
    .map((item) => item.itemName?.trim() || menuItemsById.get(item.itemId)?.name || "Item")
    .filter(Boolean);

  if (names.length === 0) {
    return "Order details unavailable";
  }

  if (names.length === 1) {
    return names[0];
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }

  return `${names[0]}, ${names[1]}, and ${names.length - 2} more`;
}

function countOrderUnits(order: OrderHistoryEntry) {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

function OrderItemThumbnail({
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
  const imageUrl = menuItem?.imageUrl;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <View style={[styles.orderThumb, stacked ? styles.orderThumbStacked : null]}>
      {imageUrl && !imageFailed ? (
        <Image source={{ uri: imageUrl }} style={styles.orderThumbImage} resizeMode="cover" onError={() => setImageFailed(true)} />
      ) : (
        <Ionicons name={resolveOrderItemIcon(label)} size={16} color={uiPalette.accent} />
      )}
    </View>
  );
}

function OrderItemStrip({
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
            <OrderItemThumbnail key={`${order.id}-${item.itemId}-${index}`} item={item} menuItemsById={menuItemsById} stacked={index > 0} />
          ))
        ) : (
          <View style={styles.orderThumb}>
            <Ionicons name="receipt-outline" size={16} color={uiPalette.accent} />
          </View>
        )}
        {remainingItemTypes > 0 ? (
          <View style={[styles.orderThumb, styles.orderThumbStacked, styles.orderThumbCount]}>
            <Text style={styles.orderThumbCountText}>{`+${remainingItemTypes}`}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.orderItemsCopy}>
        <Text style={styles.orderItemsTitle}>{buildOrderItemsSummary(order, menuItemsById)}</Text>
        <Text style={styles.orderItemsMeta}>{`${totalUnits} item${totalUnits === 1 ? "" : "s"}`}</Text>
      </View>
    </View>
  );
}

function ActiveOrderPill({ children }: { children: ReactNode }) {
  const useLiquidGlass = canUseLiquidGlassPill();

  const content = (
    <View style={[styles.activePanelInner, useLiquidGlass ? styles.activePanelInnerGlass : styles.activePanelInnerFallback]}>
      {children}
    </View>
  );

  return (
    <View style={styles.activePanelShell}>
      {useLiquidGlass ? (
        <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.activePanelFrame}>
          {content}
        </GlassView>
      ) : (
        <BlurView tint="light" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.activePanelFrame}>
          {content}
        </BlurView>
      )}
    </View>
  );
}

function OrderProgressStep({
  index,
  label,
  progressValue,
  isLast
}: {
  index: number;
  label: string;
  progressValue: SharedValue<number>;
  isLast: boolean;
}) {
  const dotAnimatedStyle = useAnimatedStyle(() => {
    const activation = clampUnit(progressValue.value - (index - 1));
    const completion = clampUnit(progressValue.value - index);

    const backgroundColor =
      activation < 1
        ? interpolateColor(activation, [0, 1], [uiPalette.background, uiPalette.surfaceStrong])
        : interpolateColor(completion, [0, 1], [uiPalette.surfaceStrong, uiPalette.primary]);

    const borderColor = interpolateColor(activation, [0, 1], [uiPalette.borderStrong, uiPalette.primary]);
    const scale = activation < 1 ? 0.88 + activation * 0.12 : 1 + completion * 0.06;

    return {
      backgroundColor,
      borderColor,
      transform: [{ scale }]
    };
  });

  const labelAnimatedStyle = useAnimatedStyle(() => {
    const activation = clampUnit(progressValue.value - (index - 1));

    return {
      color: interpolateColor(activation, [0, 1], [uiPalette.textMuted, uiPalette.text])
    };
  });

  const checkAnimatedStyle = useAnimatedStyle(
    (): ViewStyle => {
      const completion = clampUnit(progressValue.value - index);

      return {
        opacity: completion,
        transform: [{ translateY: (1 - completion) * 3 }, { scale: 0.72 + completion * 0.28 }]
      };
    },
    [index]
  );

  const leftLineAnimatedStyle = useAnimatedStyle(() => {
    const fill = clampUnit(progressValue.value - (index - 1));

    return {
      width: `${fill * 100}%`,
      opacity: fill
    };
  });

  const rightLineAnimatedStyle = useAnimatedStyle(() => {
    const fill = clampUnit(progressValue.value - index);

    return {
      width: `${fill * 100}%`,
      opacity: fill
    };
  });

  return (
    <View style={styles.progressStep}>
      <View style={styles.progressTrack}>
        {index > 0 ? (
          <View style={[styles.progressLine, styles.progressLineLeft]}>
            <Animated.View style={[styles.progressLineFill, leftLineAnimatedStyle]} />
          </View>
        ) : null}
        {!isLast ? (
          <View style={[styles.progressLine, styles.progressLineRight]}>
            <Animated.View style={[styles.progressLineFill, rightLineAnimatedStyle]} />
          </View>
        ) : null}
        <Animated.View style={[styles.progressDot, dotAnimatedStyle]}>
          <Animated.View style={checkAnimatedStyle}>
            <Ionicons name="checkmark" size={11} color="#FFFFFF" />
          </Animated.View>
        </Animated.View>
      </View>
      <Animated.Text style={[styles.progressLabel, labelAnimatedStyle]}>{label}</Animated.Text>
    </View>
  );
}

function OrderProgress({ status }: { status: OrderHistoryEntry["status"] }) {
  const activeIndex = ACTIVE_PROGRESS_STEPS.findIndex((step) => step.status === status);
  const targetIndex = activeIndex === -1 ? 0 : activeIndex + 1;
  const progressValue = useSharedValue(targetIndex);

  useEffect(() => {
    progressValue.value = withTiming(targetIndex, {
      duration: PROGRESS_ANIMATION_MS,
      easing: Easing.out(Easing.cubic)
    });
  }, [progressValue, targetIndex]);

  return (
    <View style={styles.progressWrap}>
      {ACTIVE_PROGRESS_STEPS.map((step, index) => (
        <OrderProgressStep
          key={step.status}
          index={index}
          label={step.label}
          progressValue={progressValue}
          isLast={index === ACTIVE_PROGRESS_STEPS.length - 1}
        />
      ))}
    </View>
  );
}

function HistoryRow({
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
      <View style={styles.historyTopRow}>
        <OrderStatusPill status={historyStatus} glassStyle="regular" />
        <Text style={styles.historyAmount}>{formatUsd(order.total.amountCents)}</Text>
      </View>

      <View style={styles.historyContentRow}>
        <View style={styles.historyThumbStack}>
          {previewItems.length > 0 ? (
            previewItems.map((item, index) => (
              <OrderItemThumbnail key={`${order.id}-${item.itemId}-${index}`} item={item} menuItemsById={menuItemsById} stacked={index > 0} />
            ))
          ) : (
            <View style={styles.orderThumb}>
              <Ionicons name="receipt-outline" size={16} color={uiPalette.accent} />
            </View>
          )}
          {remainingItemTypes > 0 ? (
            <View style={[styles.orderThumb, styles.orderThumbStacked, styles.orderThumbCount]}>
              <Text style={styles.orderThumbCountText}>{`+${remainingItemTypes}`}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.orderItemsCopy}>
        <Text style={styles.orderItemsTitle}>{buildOrderItemsSummary(order, menuItemsById)}</Text>
        <Text style={styles.orderItemsMeta}>{`${totalUnits} item${totalUnits === 1 ? "" : "s"}`}</Text>
      </View>

      <View style={styles.historyMetaRow}>
        <Text style={styles.historyMeta}>{formatOrderDateTime(findLatestOrderTime(order))}</Text>
        <View style={styles.historyMetaAction}>
          <Text style={styles.historyMetaActionText}>Details</Text>
          <Ionicons name="chevron-forward" size={14} color={uiPalette.textMuted} />
        </View>
      </View>
    </Pressable>
  );
}

function OrdersHeader({
  title
}: {
  title: string;
}) {
  return (
    <>
      <View style={styles.pageHeader}>
        <View style={styles.pageCopy}>
          <View style={styles.pageMetaSpacer} />
          <Text style={styles.pageTitle}>{title}</Text>
        </View>
      </View>
      <View style={styles.pageTabsSpacer} />
    </>
  );
}

export function OrdersScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isHydrating, authRecoveryState } = useAuthSession();
  const { clearFailure, clearRetryOrder } = useCheckoutFlow();
  const ordersQuery = useOrderHistoryQuery(isAuthenticated);
  const cancelOrderMutation = useCancelOrderMutation();
  const menuQuery = useMenuQuery();
  const loadingOpacity = useRef(new RNAnimated.Value(1)).current;
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [didFinishInitialReveal, setDidFinishInitialReveal] = useState(false);
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const [pendingCancelError, setPendingCancelError] = useState<string | null>(null);

  const orders = ordersQuery.data ?? [];
  const menu = resolveMenuData(menuQuery.data);
  const menuItemsById = useMemo(
    () => new Map(menu.categories.flatMap((category) => category.items).map((item) => [item.id, item])),
    [menu.categories]
  );
  const realActiveOrder = findActiveOrder(orders);
  const activeOrder = realActiveOrder;
  const activeOrderStatus = activeOrder?.status;
  const orderHistory = activeOrder ? orders.filter((order) => order.id !== activeOrder.id) : orders;
  const headerOffset = insets.top + ORDERS_HEADER_HEIGHT;
  const contentBottomInset = Math.max(getTabBarBottomOffset(insets.bottom > 0) + TAB_BAR_HEIGHT + 24 - insets.bottom, 24);
  const staticBottomInset = getTabBarBottomOffset(insets.bottom > 0) + TAB_BAR_HEIGHT + 12;
  const isInitialOrdersLoading = isAuthenticated && ordersQuery.isLoading && !ordersQuery.data;
  const shouldShowInitialLoading = !didFinishInitialReveal && (isHydrating || isInitialOrdersLoading);
  const recoveryCopy = getOrdersRecoveryCopy(authRecoveryState);

  useEffect(() => {
    if (!isAuthenticated || !activeOrder?.id) {
      return;
    }

    return apiClient.subscribeToOrderUpdates(
      activeOrder.id,
      (updatedOrder) => {
        const nextOrder = updatedOrder as OrderHistoryEntry;

        queryClient.setQueryData<OrderHistoryEntry[] | undefined>(orderHistoryQueryKey, (currentOrders) => {
          if (!currentOrders) {
            return currentOrders;
          }

          const hasExistingOrder = currentOrders.some((order) => order.id === nextOrder.id);
          const nextOrders = hasExistingOrder
            ? currentOrders.map((order) => (order.id === nextOrder.id ? nextOrder : order))
            : [nextOrder, ...currentOrders];

          return sortOrdersByLatestActivity(nextOrders);
        });
      },
      (error) => {
        if (__DEV__) {
          console.warn("Order update subscription failed", error);
        }
      }
    );
  }, [activeOrder?.id, isAuthenticated, queryClient]);

  useEffect(() => {
    if (didFinishInitialReveal) return;

    if (shouldShowInitialLoading) {
      setShowLoadingOverlay(true);
      loadingOpacity.stopAnimation();
      loadingOpacity.setValue(1);
      return;
    }

    if (!showLoadingOverlay) {
      setDidFinishInitialReveal(true);
      return;
    }

    setShowLoadingOverlay(true);
    loadingOpacity.stopAnimation();
    RNAnimated.timing(loadingOpacity, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (!finished) return;
      setShowLoadingOverlay(false);
      setDidFinishInitialReveal(true);
    });
  }, [didFinishInitialReveal, loadingOpacity, shouldShowInitialLoading, showLoadingOverlay]);

  useEffect(() => {
    if ((activeOrderStatus ?? activeOrder?.status) !== "PENDING_PAYMENT") {
      setPendingCancelError(null);
    }
  }, [activeOrder?.id, activeOrder?.status, activeOrderStatus]);

  const refreshOrders = () => {
    if (isManualRefresh) return;

    setIsManualRefresh(true);
    void Promise.allSettled([ordersQuery.refetch()]).finally(() => {
      setIsManualRefresh(false);
    });
  };

  const cancelPendingPaymentOrder = async () => {
    if (!activeOrder || (activeOrderStatus ?? activeOrder.status) !== "PENDING_PAYMENT" || cancelOrderMutation.isPending) {
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
        <ScreenStatic style={[styles.loggedOutStaticPage, { paddingTop: headerOffset, paddingBottom: staticBottomInset }]}>
          <View style={styles.loggedOutStaticBody}>
            <Text style={styles.loggedOutStaticTitle}>{recoveryCopy.title}</Text>
            <Text style={styles.loggedOutStaticText}>{recoveryCopy.body}</Text>
          </View>
        </ScreenStatic>

        <View pointerEvents="none" style={[styles.pageHeaderFloating, { paddingTop: insets.top, height: insets.top + ORDERS_HEADER_HEIGHT }]}>
          <OrdersHeader title="Orders" />
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
                <Text style={styles.activeAmount}>{formatUsd(activeOrder.total.amountCents)}</Text>
              </View>

              <Text style={styles.activeTitle}>{getActiveOrderTitle(activeOrderStatus ?? activeOrder.status)}</Text>
              <Text style={styles.activeBody}>{getActiveOrderBody(activeOrderStatus ?? activeOrder.status)}</Text>

              <OrderItemStrip order={activeOrder} menuItemsById={menuItemsById} />

              <View style={styles.pickupCodeBlock}>
                <Text style={styles.metricLabel}>Pickup code</Text>
                <Text style={styles.pickupCodeValue}>{activeOrder.pickupCode}</Text>
              </View>

              <OrderProgress status={activeOrderStatus ?? activeOrder.status} />

              <Text style={styles.activeStatusNote}>{getLatestOrderTimelineNote(activeOrder)}</Text>

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
                  {pendingCancelError ? <Text style={styles.pendingCancelError}>{pendingCancelError}</Text> : null}
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
                  <Text style={styles.sectionMeta}>{`${orderHistory.length} total`}</Text>
                ) : undefined
              }
            />
          </View>

          {ordersQuery.error ? (
            <View style={styles.sectionMessageBlock}>
              <Text style={styles.sectionMessage}>Unable to load recent orders.</Text>
              <Button label="Retry" variant="secondary" onPress={refreshOrders} style={styles.sectionMessageAction} />
            </View>
          ) : null}
          {!ordersQuery.isLoading && !ordersQuery.error && orderHistory.length === 0 ? (
            <Text style={styles.sectionMessage}>Completed pickups and older orders will collect here.</Text>
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

      <View pointerEvents="none" style={[styles.pageHeaderFloating, { paddingTop: insets.top, height: insets.top + ORDERS_HEADER_HEIGHT }]}>
        <OrdersHeader title={activeOrder ? "Track your order" : "Past Orders"} />
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
    backgroundColor: uiPalette.background,
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
    fontFamily: uiTypography.displayFamily,
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
  statusPill: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1
  },
  statusPillShell: {
    position: "relative",
    alignSelf: "flex-start",
    borderRadius: 999,
    overflow: "hidden"
  },
  statusPillFrame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    overflow: "hidden"
  },
  statusPillContent: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999
  },
  statusPillText: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "700"
  },
  statusPillTextGlass: {
    color: uiPalette.text
  },
  activePanelShell: {
    borderRadius: 36,
    overflow: "hidden"
  },
  activePanelFrame: {
    borderRadius: 36,
    overflow: "hidden"
  },
  activePanelInner: {
    padding: 22,
    borderRadius: 36,
    borderWidth: 1
  },
  activePanelInnerGlass: {
    backgroundColor: "rgba(255,255,255,0.01)",
    borderColor: "rgba(255,255,255,0.18)"
  },
  activePanelInnerFallback: {
    backgroundColor: "rgba(255, 253, 248, 0.78)",
    borderColor: "rgba(255,255,255,0.42)"
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
  progressWrap: {
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: uiPalette.border,
    alignSelf: "center",
    width: "100%",
    maxWidth: 420,
    flexDirection: "row",
    alignItems: "flex-start"
  },
  progressStep: {
    flex: 1,
    alignItems: "center"
  },
  progressTrack: {
    width: "100%",
    height: 22,
    position: "relative",
    alignItems: "center",
    justifyContent: "center"
  },
  progressDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: uiPalette.borderStrong,
    backgroundColor: uiPalette.background,
    alignItems: "center",
    justifyContent: "center"
  },
  progressDotComplete: {
    backgroundColor: uiPalette.primary,
    borderColor: uiPalette.primary
  },
  progressDotCurrent: {
    backgroundColor: uiPalette.surfaceStrong,
    borderColor: uiPalette.primary
  },
  progressLine: {
    position: "absolute",
    top: 10.5,
    height: 1,
    backgroundColor: uiPalette.borderStrong,
    overflow: "hidden"
  },
  progressLineFill: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: "100%",
    backgroundColor: uiPalette.primary
  },
  progressLineLeft: {
    left: 0,
    right: "50%",
    marginRight: 19
  },
  progressLineRight: {
    left: "50%",
    right: 0,
    marginLeft: 19
  },
  progressLineComplete: {
    backgroundColor: uiPalette.primary
  },
  progressLabel: {
    marginTop: 10,
    maxWidth: 80,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    color: uiPalette.textMuted
  },
  progressLabelActive: {
    color: uiPalette.text
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
  activeStatusNote: {
    marginTop: 16,
    fontSize: 14,
    lineHeight: 21,
    color: uiPalette.textSecondary
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
  historyRow: {
    paddingVertical: 18,
    paddingHorizontal: 2,
    borderRadius: 20
  },
  historyContentRow: {
    marginTop: 12,
    alignItems: "flex-start"
  },
  historyThumbStack: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0
  },
  historyRowPressed: {
    opacity: 0.78
  },
  historyTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  historyAmount: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "400"
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
    backgroundColor: "#D5D4CE",
    alignItems: "center",
    justifyContent: "center"
  },
  orderThumbStacked: {
    marginLeft: -8
  },
  orderThumbImage: {
    width: "100%",
    height: "100%"
  },
  orderThumbCount: {
    backgroundColor: "#D5D4CE"
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
  historyMeta: {
    fontSize: 13,
    lineHeight: 19,
    color: uiPalette.textSecondary
  },
  historyMetaRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
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
  },
  historyDivider: {
    height: 1,
    marginVertical: 10,
    backgroundColor: uiPalette.border
  }
});
