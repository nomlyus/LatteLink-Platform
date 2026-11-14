import { CartLineItem } from "../src/cart/CartLineItem";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { CartHeader, CartCheckoutToolbar, nativeCartToolbarAvailable } from "../src/cart/CartNavigation";
import { getCheckoutRecoveryActionLabel } from "../src/auth/recovery";
import { useAuthSession } from "../src/auth/session";
import {
  CartHeaderActionChip,
  CartSectionHeading,
  CartStickyActionPill,
  CartSummaryRow
} from "../src/cart/CartPrimitives";
import { useCart } from "../src/cart/store";
import { useLocationContext } from "../src/location/LocationProvider";
import {
  formatUsd,
  resolveMenuData,
  useMenuQuery
} from "../src/menu/catalog";
import { useCheckoutController } from "../src/orders/useCheckoutController";
import { useCheckoutFlow } from "../src/orders/flow";
import { getTabBarBottomOffset, TAB_BAR_HEIGHT } from "../src/navigation/tabBarMetrics";
import { uiPalette } from "../src/ui/system";
import { NativeCornerView } from "../src/ui/NativeCornerView";
import { useNativeScrollEdge } from "../src/navigation/useNativeScrollEdge";
import { nativeAppleHeaderCapabilities } from "../src/navigation/nativeAppleHeader";
import { DiscountCodeField } from "../src/cart/DiscountCodeField";
import { useCartScrollLayout } from "../src/cart/useCartScrollLayout";

export default function CartModalScreen() {
  return (
      <SafeAreaProvider style={{ backgroundColor: uiPalette.backgroundAlt }}>
        <CartContent />
      </SafeAreaProvider>
  );
}

function CartContent() {
  const router = useRouter();
  const registerScrollEdge = useNativeScrollEdge(nativeAppleHeaderCapabilities().available);
  const scrollLayout = useCartScrollLayout(registerScrollEdge);
  const insets = useSafeAreaInsets();
  const stickyFooterBottom = getTabBarBottomOffset(insets.bottom > 0);
  const stickyFooterClearance = stickyFooterBottom + TAB_BAR_HEIGHT + 16;
  const { isAuthenticated, authRecoveryState } = useAuthSession();
  const {
    items,
    itemCount,
    subtotalCents,
    discountCode,
    setDiscountCode,
    setQuantity,
    removeItem,
    clear
  } = useCart();
  const hadItems = useRef(items.length > 0);
  const location = useLocationContext();
  const discountAfterSignIn = useRef<{ code: string; items: typeof items; locationId: string | null; brandId: string } | null>(null);
  const { confirmation, paymentConfirmationPending, failure, clearRetryOrder, clearFailure } = useCheckoutFlow();
  const checkout = useCheckoutController();
  const applyDiscountRef = useRef(checkout.discount.apply);
  applyDiscountRef.current = checkout.discount.apply;
  const {
    storeConfig, pricingSummary, checkoutUnavailableMessage, checkoutReady, checkoutContextLoading,
    showCheckoutRetry, locationContextValid, paymentInProgress, statusMessage
  } = checkout;
  const menuQuery = useMenuQuery();
  const menu = menuQuery.data ? resolveMenuData(menuQuery.data) : null;
  const menuItemsById = useMemo(
    () => new Map((menu?.categories ?? []).flatMap((category) => category.items).map((item) => [item.id, item])),
    [menu?.categories]
  );
  const stickyActionDisabled = !checkoutReady || !locationContextValid || items.length === 0 || paymentInProgress || checkout.discount.applying;
  const stickyActionLabel = !checkoutReady
    ? checkoutContextLoading
      ? "Loading checkout"
      : storeConfig && !storeConfig.isOpen
        ? "Store closed"
        : "Checkout unavailable"
    : !locationContextValid
      ? "Bag location unavailable"
      : isAuthenticated
        ? checkout.payActionLabel
        : getCheckoutRecoveryActionLabel(authRecoveryState);
  const stickyActionIcon: keyof typeof Ionicons.glyphMap =
    !checkoutReady || !locationContextValid
      ? "alert-circle-outline"
      : isAuthenticated
        ? checkout.retryableOrder
          ? "refresh-outline"
          : "card-outline"
        : "log-in-outline";
  const stickyActionValue = formatUsd(checkoutReady ? pricingSummary.totalCents : subtotalCents);

  useFocusEffect(
    useCallback(() => {
      if (confirmation || paymentConfirmationPending) {
        router.replace("/checkout-success");
        return;
      }

      if (failure) {
        router.replace("/checkout-failure");
        return;
      }

      if (isAuthenticated && discountAfterSignIn.current) {
        const intent = discountAfterSignIn.current;
        discountAfterSignIn.current = null;
        if (intent.code === discountCode && intent.items === items && intent.locationId === location.selectedLocationId && intent.brandId === location.brandId) {
          void applyDiscountRef.current();
        }
      }

      // Only dismiss while Cart is focused; checkout may clear the shared cart in the background.
      if (items.length === 0 && hadItems.current && !paymentInProgress) {
        hadItems.current = false;
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)/(navigation)/menu");
      } else if (items.length > 0) {
        hadItems.current = true;
      }
    }, [confirmation, paymentConfirmationPending, failure, items, paymentInProgress, router, isAuthenticated, discountCode, location.selectedLocationId, location.brandId])
  );

  function refreshCheckoutContext() {
    checkout.refreshCheckoutContext();
    void menuQuery.refetch();
  }

  function resetCartState() {
    if (checkout.isPaymentInFlight()) return;
    clear();
    clearFailure();
    clearRetryOrder();
  }

  function openCheckout() {
    if (isAuthenticated) void checkout.handleStripeCheckout();
    else router.push("/cart-sign-in");
  }

  function confirmClearCart() {
    Alert.alert(
      "Clear cart?",
      `Remove all ${itemCount} ${itemCount === 1 ? "item" : "items"} from your cart?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear Cart", style: "destructive", onPress: resetCartState }
      ]
    );
  }

  function confirmRemoveItem(lineId: string, itemName: string) {
    Alert.alert("Remove item?", `Remove ${itemName} from your cart?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        if (!checkout.isPaymentInFlight()) removeItem(lineId);
      } }
    ]);
  }

  return (
    <View style={styles.backdrop}>
      <CartHeader paymentInProgress={paymentInProgress} onClear={items.length > 0 && !paymentInProgress ? confirmClearCart : undefined} />
      <View collapsable={false} style={styles.sheet}>
        <ScrollView
          onLayout={scrollLayout.onLayout}
          bounces
          alwaysBounceVertical={false}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[
            {
              minHeight: scrollLayout.minimumHeight,
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: items.length > 0 && !nativeCartToolbarAvailable ? stickyFooterClearance : 24
            },
            items.length === 0 ? styles.emptyScrollContent : null
          ]}
        >
        {location.cartInvalidatedNotice || !checkoutReady || (statusMessage && !paymentInProgress) ? <View style={styles.headerArea}>
          {statusMessage && !paymentInProgress ? <Text accessibilityRole="alert" allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.headerSubtitle}>{statusMessage}</Text> : null}
          {location.cartInvalidatedNotice ? (
            <NativeCornerView style={styles.locationNotice} cornerMode="fixed" fallbackRadius={12}>
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
            </NativeCornerView>
          ) : null}
          {!checkoutReady ? <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.headerSubtitle}>
                {checkoutUnavailableMessage}
              </Text>
            </View>
            {showCheckoutRetry ? (
              <CartHeaderActionChip label="Retry" icon="refresh-outline" onPress={refreshCheckoutContext} />
            ) : null}
          </View> : null}
        </View> : null}
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
                <CartSectionHeading title="Items" />

                <NativeCornerView style={styles.lineStack} cornerMode="fixed" fallbackRadius={18}>
                  {items.map((item, index) => (
                    <CartLineItem
                      key={item.lineId}
                      item={item}
                      imageUrl={menuItemsById.get(item.menuItemId)?.imageUrl}
                      isLast={index === items.length - 1}
                      disabled={paymentInProgress}
                      onSetQuantity={(quantity) => { if (!checkout.isPaymentInFlight()) setQuantity(item.lineId, quantity); }}
                      onRemove={() => confirmRemoveItem(item.lineId, item.itemName)}
                    />
                  ))}
                </NativeCornerView>
              </View>

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

              <View style={styles.checkoutSpacer} />
              <View style={styles.checkoutDeck}>
                <CartSectionHeading title="Discount code" />
                  <View style={styles.discountCodeBlock}>
                    <DiscountCodeField value={discountCode} disabled={paymentInProgress}
                      applying={checkout.discount.applying} applied={checkout.discount.applied} error={checkout.discount.error}
                      onApply={() => {
                        if (!isAuthenticated) {
                          discountAfterSignIn.current = { code: discountCode, items, locationId: location.selectedLocationId, brandId: location.brandId };
                          router.push("/cart-sign-in");
                        }
                        else void checkout.discount.apply();
                      }} onChange={(code) => {
                      if (!checkout.isPaymentInFlight()) setDiscountCode(code);
                    }} />
                  </View>
                <CartSectionHeading title="Summary" />
                <NativeCornerView style={styles.checkoutContent} cornerMode="fixed" fallbackRadius={18}>
                  <View style={styles.summaryWrap}>
                    <CartSummaryRow label={`Items (${itemCount})`} value={formatUsd(pricingSummary.subtotalCents)} />
                    {storeConfig ? (
                      <>
                        <CartSummaryRow
                          label="Tax"
                          value={formatUsd(pricingSummary.taxCents)}
                        />
                        {pricingSummary.discountCents > 0 ? <CartSummaryRow label="Discount" value={`−${formatUsd(pricingSummary.discountCents)}`} /> : null}
                        <View style={styles.summaryDivider} />
                        <CartSummaryRow
                          label="Total due today"
                          value={formatUsd(checkout.authoritativeTotal ?? pricingSummary.totalCents)}
                          emphasized
                        />
                      </>
                    ) : (
                      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.summaryNote}>
                        Reconnect store details to load live tax, pickup timing, and checkout totals.
                      </Text>
                    )}
                  </View>
                </NativeCornerView>
              </View>
            </>
          )}
        </ScrollView>

        {items.length > 0 && nativeCartToolbarAvailable ? (
          <CartCheckoutToolbar contentWidth={scrollLayout.contentWidth} label={stickyActionLabel} value={isAuthenticated ? undefined : stickyActionValue}
            disabled={stickyActionDisabled} onPress={openCheckout} />
        ) : items.length > 0 ? (
          <View pointerEvents="box-none" style={[styles.stickyFooterWrap, { bottom: stickyFooterBottom }]}>
            <CartStickyActionPill
              label={stickyActionLabel}
              value={stickyActionValue}
              icon={stickyActionIcon}
              disabled={stickyActionDisabled}
              onPress={openCheckout}
            />
          </View>
        ) : null}

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
    backgroundColor: "transparent"
  },
  headerArea: {
    paddingBottom: 12
  },
  locationNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: uiPalette.surfaceStrong
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
  headerSubtitle: {
    marginTop: 6,
    marginBottom: 6,
    fontSize: 13,
    lineHeight: 18,
    color: uiPalette.textSecondary
  },
  emptyScrollContent: {
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
    marginTop: 12,
    paddingHorizontal: 16,
    backgroundColor: uiPalette.card,
    overflow: "hidden"
  },
  checkoutDeck: {
    flexShrink: 0
  },
  checkoutSpacer: {
    flexGrow: 1,
    minHeight: 8
  },
  pickupMethodBlock: {
    marginTop: 18
  },
  checkoutContent: {
    marginTop: 12,
    padding: 16,
    backgroundColor: uiPalette.card
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
  discountCodeBlock: {
    marginHorizontal: -20,
    marginBottom: 8
  },
  summaryWrap: {
    gap: 10
  },
  summaryDivider: {
    height: 1,
    backgroundColor: uiPalette.border
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
