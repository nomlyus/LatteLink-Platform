import { CartLineItem } from "../src/cart/CartLineItem";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getCheckoutRecoveryActionLabel } from "../src/auth/recovery";
import { useAuthSession } from "../src/auth/session";
import { ClearCartSheet } from "../src/cart/ClearCartSheet";
import {
  CartHeaderActionChip,
  CartSectionHeading,
  CartStickyActionPill,
  CartSummaryRow
} from "../src/cart/CartPrimitives";
import { buildPricingSummary } from "../src/cart/model";
import { RemoveItemSheet } from "../src/cart/RemoveItemSheet";
import { useCart } from "../src/cart/store";
import { useLocationContext } from "../src/location/LocationProvider";
import {
  formatUsd,
  resolveAppConfigData,
  resolveMenuData,
  resolveStoreConfigData,
  useAppConfigQuery,
  useMenuQuery,
  useStoreConfigQuery
} from "../src/menu/catalog";
import { isCheckoutLocationConsistent, isRetryableCheckoutForCart, toQuoteItems } from "../src/orders/checkout";
import { useCheckoutFlow } from "../src/orders/flow";
import { getTabBarBottomOffset, TAB_BAR_HEIGHT } from "../src/navigation/tabBarMetrics";
import { uiPalette, uiTypography } from "../src/ui/system";

export default function CartModalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const stickyFooterBottom = getTabBarBottomOffset(insets.bottom > 0);
  const stickyFooterClearance = stickyFooterBottom + TAB_BAR_HEIGHT + 16;
  const { isAuthenticated, authRecoveryState } = useAuthSession();
  const {
    items,
    locationId: cartLocationId,
    itemCount,
    subtotalCents,
    discountCode,
    setDiscountCode,
    setQuantity,
    removeItem,
    clear
  } = useCart();
  const location = useLocationContext();
  const { confirmation, failure, retryOrder, clearRetryOrder, clearFailure } = useCheckoutFlow();
  const appConfigQuery = useAppConfigQuery();
  const menuQuery = useMenuQuery();
  const storeConfigQuery = useStoreConfigQuery();
  const menu = menuQuery.data ? resolveMenuData(menuQuery.data) : null;
  const appConfig = appConfigQuery.data ? resolveAppConfigData(appConfigQuery.data) : null;
  const storeConfig = storeConfigQuery.data ? resolveStoreConfigData(storeConfigQuery.data) : null;
  const pricingSummary = buildPricingSummary(subtotalCents, storeConfig?.taxRateBasisPoints ?? 0);
  const storeConfigLoading = !storeConfig && (storeConfigQuery.isLoading || storeConfigQuery.isFetching);
  const appConfigLoading = !appConfig && (appConfigQuery.isLoading || appConfigQuery.isFetching);
  const checkoutContextLoading = storeConfigLoading || appConfigLoading;
  const storeClosedMessage =
    storeConfig && !storeConfig.isOpen ? "The store is currently closed. Come back during opening hours." : null;
  const checkoutUnavailableMessage = storeConfigLoading
    ? "Loading store hours..."
    : appConfigLoading
      ? "Loading checkout configuration..."
      : !storeConfig
        ? "Store details are temporarily unavailable. Retry loading checkout before paying."
        : !appConfig
          ? "Checkout configuration is temporarily unavailable. Retry loading checkout before paying."
          : storeClosedMessage;
  const checkoutReady = checkoutUnavailableMessage === null;
  const showCheckoutRetry = Boolean(checkoutUnavailableMessage) && !checkoutContextLoading;
  const quoteItems = useMemo(() => toQuoteItems(items), [items]);
  const retryableOrder = isRetryableCheckoutForCart(retryOrder, quoteItems, cartLocationId, location.selectedLocationId)
    ? (retryOrder ?? undefined)
    : undefined;
  const menuItemsById = useMemo(
    () => new Map((menu?.categories ?? []).flatMap((category) => category.items).map((item) => [item.id, item])),
    [menu?.categories]
  );
  const [pendingRemovalLineId, setPendingRemovalLineId] = useState<string | null>(null);
  const pendingRemovalItem = useMemo(
    () => items.find((item) => item.lineId === pendingRemovalLineId) ?? null,
    [items, pendingRemovalLineId]
  );
  const [clearSheetOpen, setClearSheetOpen] = useState(false);
  const locationContextValid = isCheckoutLocationConsistent(cartLocationId, location.selectedLocationId);
  const stickyActionDisabled = !checkoutReady || !locationContextValid || items.length === 0;
  const stickyActionLabel = !checkoutReady
    ? checkoutContextLoading
      ? "Loading checkout"
      : storeClosedMessage
        ? "Store closed"
        : "Checkout unavailable"
    : !locationContextValid
      ? "Bag location unavailable"
      : isAuthenticated
        ? retryableOrder
          ? "Retry payment"
          : "Continue to checkout"
        : getCheckoutRecoveryActionLabel(authRecoveryState);
  const stickyActionIcon: keyof typeof Ionicons.glyphMap =
    !checkoutReady || !locationContextValid
      ? "alert-circle-outline"
      : isAuthenticated
        ? retryableOrder
          ? "refresh-outline"
          : "card-outline"
        : "log-in-outline";
  const stickyActionValue = formatUsd(checkoutReady ? pricingSummary.totalCents : subtotalCents);

  useEffect(() => {
    if (
      retryOrder &&
      !isRetryableCheckoutForCart(retryOrder, quoteItems, cartLocationId, location.selectedLocationId)
    ) {
      clearRetryOrder();
    }
  }, [cartLocationId, clearRetryOrder, location.selectedLocationId, quoteItems, retryOrder]);

  useFocusEffect(
    useCallback(() => {
      if (confirmation) {
        router.replace("/checkout-success");
        return;
      }

      if (failure) {
        router.replace("/checkout-failure");
      }
    }, [confirmation, failure, router])
  );

  useEffect(() => {
    if (pendingRemovalLineId && !pendingRemovalItem) {
      setPendingRemovalLineId(null);
    }
  }, [pendingRemovalItem, pendingRemovalLineId]);

  function refreshCheckoutContext() {
    void Promise.allSettled([appConfigQuery.refetch(), storeConfigQuery.refetch(), menuQuery.refetch()]);
  }

  function resetCartState() {
    setClearSheetOpen(false);
    setPendingRemovalLineId(null);
    clear();
    clearFailure();
    clearRetryOrder();
  }

  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <View style={styles.handleWrap}>
          <View style={styles.modalHandle} />
        </View>

        <View style={styles.headerArea}>
          {location.cartInvalidatedNotice ? (
            <View style={styles.locationNotice}>
              <Ionicons name="information-circle-outline" size={18} color={uiPalette.warning} />
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.locationNoticeText}>
                {location.cartInvalidatedNotice}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss cart notice"
                onPress={location.dismissCartInvalidatedNotice}
                hitSlop={8}
              >
                <Ionicons name="close" size={17} color={uiPalette.textMuted} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.headerTitle}>
                Order Review
              </Text>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.headerSubtitle}>
                {storeConfig
                  ? storeConfig.isOpen
                    ? `Estimated wait is ${storeConfig.prepEtaMinutes} min`
                    : "Store closed"
                  : storeConfigLoading
                    ? "Loading store hours..."
                    : "Checkout details unavailable"}
              </Text>
            </View>
            {showCheckoutRetry ? (
              <CartHeaderActionChip label="Retry" icon="refresh-outline" onPress={refreshCheckoutContext} />
            ) : null}
          </View>
        </View>
        <ScrollView
          bounces
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[
            {
              paddingHorizontal: 20,
              paddingTop: items.length > 0 ? 14 : 8,
              paddingBottom: items.length > 0 ? stickyFooterClearance : Math.max(insets.bottom, 12) + 8
            },
            items.length === 0 ? styles.emptyScrollContent : null
          ]}
        >
          {items.length === 0 ? (
            <View style={styles.emptyPage}>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.emptyEyebrow}>
                Bag
              </Text>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.emptyTitle}>
                Your cart is empty.
              </Text>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.emptyBody}>
                Add drinks or pastries from the menu, then come back here to review and pay.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.sectionBlock}>
                <CartSectionHeading
                  eyebrow="Bag"
                  title="Items"
                  action={
                    <CartHeaderActionChip label="Clear" icon="close-outline" onPress={() => setClearSheetOpen(true)} />
                  }
                />

                <View style={styles.lineStack}>
                  {items.map((item, index) => (
                    <CartLineItem
                      key={item.lineId}
                      item={item}
                      imageUrl={menuItemsById.get(item.menuItemId)?.imageUrl}
                      isLast={index === items.length - 1}
                      onSetQuantity={(quantity) => setQuantity(item.lineId, quantity)}
                      onRemove={() => setPendingRemovalLineId(item.lineId)}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.checkoutDeck}>
                {storeConfig ? (
                  <View style={styles.pickupMethodBlock}>
                    <View style={styles.pickupMethodRow}>
                      <Ionicons name="location-outline" size={13} color={uiPalette.textMuted} />
                      <Text
                        allowFontScaling={false}
                        maxFontSizeMultiplier={1}
                        style={styles.pickupMethodText}
                      >{`Counter Pickup · ${storeConfig.prepEtaMinutes} min`}</Text>
                    </View>
                  </View>
                ) : null}

                <CartSectionHeading eyebrow="Checkout" title="Summary" />
                <View style={styles.checkoutContent}>
                  <View style={styles.deckDivider} />
                  <View style={styles.discountCodeBlock}>
                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.discountCodeLabel}>
                      Discount code
                    </Text>
                    <TextInput
                      allowFontScaling={false}
                      maxFontSizeMultiplier={1}
                      value={discountCode}
                      onChangeText={setDiscountCode}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      placeholder="LAUNCH10"
                      placeholderTextColor={uiPalette.textMuted}
                      style={styles.discountCodeInput}
                    />
                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.summaryNote}>
                      Discounts are validated against live store rules when you pay.
                    </Text>
                  </View>

                  <View style={styles.summaryWrap}>
                    <CartSummaryRow label={`Items (${itemCount})`} value={formatUsd(pricingSummary.subtotalCents)} />
                    {storeConfig ? (
                      <>
                        <CartSummaryRow
                          label={`Tax (${(storeConfig.taxRateBasisPoints / 100).toFixed(2)}%)`}
                          value={formatUsd(pricingSummary.taxCents)}
                        />
                        <View style={styles.summaryDivider} />
                        <CartSummaryRow
                          label="Total due today"
                          value={formatUsd(pricingSummary.totalCents)}
                          emphasized
                        />
                      </>
                    ) : (
                      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.summaryNote}>
                        Reconnect store details to load live tax, pickup timing, and checkout totals.
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            </>
          )}
        </ScrollView>

        {items.length > 0 ? (
          <View pointerEvents="box-none" style={[styles.stickyFooterWrap, { bottom: stickyFooterBottom }]}>
            <CartStickyActionPill
              label={stickyActionLabel}
              value={stickyActionValue}
              icon={stickyActionIcon}
              disabled={stickyActionDisabled}
              onPress={() => {
                if (isAuthenticated) {
                  router.push("/checkout");
                  return;
                }

                router.push({ pathname: "/auth", params: { returnTo: "cart" } });
              }}
            />
          </View>
        ) : null}

        <ClearCartSheet
          open={clearSheetOpen}
          itemCount={itemCount}
          bottomInset={Math.max(insets.bottom, 14)}
          onClose={() => setClearSheetOpen(false)}
          onCancel={() => setClearSheetOpen(false)}
          onConfirm={resetCartState}
        />

        <RemoveItemSheet
          open={pendingRemovalItem !== null}
          itemName={pendingRemovalItem?.itemName}
          bottomInset={Math.max(insets.bottom, 14)}
          onClose={() => setPendingRemovalLineId(null)}
          onCancel={() => setPendingRemovalLineId(null)}
          onConfirm={() => {
            if (!pendingRemovalItem) return;
            removeItem(pendingRemovalItem.lineId);
            setPendingRemovalLineId(null);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "transparent"
  },
  sheet: {
    flex: 1,
    backgroundColor: "rgba(247, 244, 237, 0.985)",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: uiPalette.border
  },
  handleWrap: {
    position: "absolute",
    top: 14,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10
  },
  modalHandle: {
    width: 38,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(151, 160, 154, 0.52)"
  },
  headerArea: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 4
  },
  locationNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 13,
    backgroundColor: "rgba(207, 148, 73, 0.12)"
  },
  locationNoticeText: {
    flex: 1,
    color: uiPalette.textSecondary,
    fontSize: 12,
    lineHeight: 17
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  headerCopy: {
    flex: 1
  },
  headerTitle: {
    marginTop: 15,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  },
  headerSubtitle: {
    marginTop: 6,
    marginBottom: 6,
    fontSize: 13,
    lineHeight: 18,
    color: uiPalette.textSecondary
  },
  emptyScrollContent: {
    flexGrow: 1,
    justifyContent: "center"
  },
  emptyPage: {
    alignItems: "center"
  },
  emptyEyebrow: {
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 1.15,
    color: uiPalette.textMuted,
    fontWeight: "700",
    textAlign: "center"
  },
  emptyTitle: {
    marginTop: 6,
    fontSize: 16,
    lineHeight: 22,
    color: uiPalette.text,
    fontWeight: "600",
    textAlign: "center"
  },
  emptyBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: uiPalette.textSecondary,
    maxWidth: 340,
    textAlign: "center"
  },
  sectionBlock: {
    marginTop: 4
  },
  lineStack: {
    marginTop: 16
  },
  checkoutDeck: {
    marginTop: 18,
    paddingTop: 2
  },
  pickupMethodBlock: {
    marginBottom: 0
  },
  checkoutContent: {
    marginTop: 16
  },
  pickupMethodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 12
  },
  pickupMethodText: {
    fontSize: 13,
    lineHeight: 17,
    color: uiPalette.textSecondary,
    fontWeight: "500"
  },
  deckDivider: {
    height: 1,
    marginVertical: 18,
    backgroundColor: "rgba(23, 21, 19, 0.08)"
  },
  discountCodeBlock: {
    marginBottom: 18,
    gap: 8
  },
  discountCodeLabel: {
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 1.15,
    color: uiPalette.textMuted,
    fontWeight: "700"
  },
  discountCodeInput: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: uiPalette.border,
    backgroundColor: uiPalette.surfaceStrong,
    paddingHorizontal: 14,
    color: uiPalette.text,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 1.2,
    fontWeight: "700"
  },
  summaryWrap: {
    gap: 10
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "rgba(23, 21, 19, 0.08)"
  },
  summaryNote: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: uiPalette.textSecondary
  },
  stickyFooterWrap: {
    position: "absolute",
    left: 18,
    right: 18
  }
});
