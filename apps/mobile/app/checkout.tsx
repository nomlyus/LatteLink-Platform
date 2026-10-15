import { useCheckoutController } from "../src/orders/useCheckoutController";
import { Ionicons } from "@expo/vector-icons";

import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { formatUsd } from "../src/menu/catalog";

import { GlassActionPill } from "../src/cart/GlassActionPill";
import { Button, Card, SectionLabel, uiPalette, uiTypography } from "../src/ui/system";
import { BagLineItem, StatusBanner, SummaryRow } from "../src/orders/CheckoutPrimitives";

export default function CheckoutScreen() {
  const {
    insets,
    items,
    discountCode,
    setDiscountCode,
    storeConfig,
    pricingSummary,
    storeConfigLoading,
    checkoutUnavailableMessage,
    checkoutUnavailableTone,
    showCheckoutRetry,
    retryableOrder,
    itemCount,
    brandName,
    storeStatusLabel,
    etaLabel,
    statusMessage,
    statusTone,
    payActionDisabled,
    payActionLabel,
    refreshCheckoutContext,
    dismissCheckout,
    handleStripeCheckout,
    scrollBottomPadding
  } = useCheckoutController();
  return (
    <View style={styles.screen}>
      <View style={styles.handleWrap}>
        <View style={styles.handle} />
      </View>

      <View style={styles.headerArea}>
        {showCheckoutRetry ? (
          <View style={styles.headerUtilityRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry checkout configuration"
              onPress={refreshCheckoutContext}
              style={({ pressed }) => [styles.inlineAction, pressed ? styles.inlineActionPressed : null]}
            >
              <Ionicons name="refresh-outline" size={15} color={uiPalette.textSecondary} />
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.inlineActionText}>
                Retry
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.headerTitle}>
          Checkout
        </Text>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.headerSubtitle}>
          {storeConfig
            ? storeConfig.isOpen
              ? `${brandName} • ${etaLabel}`
              : "Store closed"
            : storeConfigLoading
              ? "Loading store hours..."
              : "Checkout details unavailable"}
        </Text>
      </View>

      <ScrollView
        bounces
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
      >
        {items.length === 0 ? (
          <Card style={styles.emptyState}>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.emptyTitle}>
              Your cart is empty.
            </Text>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.emptyBody}>
              Add items from the menu before opening checkout.
            </Text>
            <Button label="Back to cart" variant="secondary" onPress={dismissCheckout} />
          </Card>
        ) : (
          <>
            {retryableOrder ? (
              <StatusBanner
                message="Payment did not complete. Your checkout is saved temporarily so you can retry."
                tone="warning"
              />
            ) : null}

            <Card style={styles.sectionCard}>
              <SectionLabel label="Order" />
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionTitle}>
                Summary
              </Text>
              <View style={styles.summaryMetaRow}>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.summaryMetaText}>
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </Text>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.summaryMetaDot}>
                  •
                </Text>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.summaryMetaText}>
                  {storeStatusLabel}
                </Text>
              </View>
              {storeConfig?.pickupInstructions ? (
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionBody}>
                  {storeConfig.pickupInstructions}
                </Text>
              ) : null}

              <View style={styles.bagList}>
                {items.map((item) => (
                  <BagLineItem key={item.lineId} item={item} />
                ))}
              </View>

              <View style={styles.sectionDivider} />
              <View style={styles.primaryField}>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.fieldLabel}>
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
                  style={styles.fieldInput}
                />
                {discountCode ? (
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.fieldHint}>
                    Code will be validated before Stripe opens. The payment sheet will show the final discounted total.
                  </Text>
                ) : null}
              </View>
              <View style={styles.sectionDivider} />

              <SummaryRow label="Subtotal" value={formatUsd(pricingSummary.subtotalCents)} />
              {discountCode ? <SummaryRow label="Discount code" value={discountCode} /> : null}
              <SummaryRow label="Tax" value={formatUsd(pricingSummary.taxCents)} />
              <SummaryRow label="Total" value={formatUsd(pricingSummary.totalCents)} emphasized />
            </Card>
          </>
        )}
      </ScrollView>

      {items.length > 0 ? (
        <View pointerEvents="box-none" style={[styles.bottomDock, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {checkoutUnavailableMessage || statusMessage ? (
            <View style={styles.bottomStatusStack}>
              {checkoutUnavailableMessage ? (
                <StatusBanner message={checkoutUnavailableMessage} tone={checkoutUnavailableTone} />
              ) : null}

              {statusMessage ? (
                <StatusBanner message={statusMessage} tone={statusTone === "warning" ? "warning" : "info"} />
              ) : null}
            </View>
          ) : null}

          <GlassActionPill
            label={payActionLabel}
            onPress={() => {
              void handleStripeCheckout();
            }}
            tone="dark"
            disabled={payActionDisabled}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: uiPalette.background
  },
  handleWrap: {
    position: "absolute",
    top: 14,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10
  },
  handle: {
    width: 38,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(151, 160, 154, 0.52)"
  },
  headerArea: {
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 8
  },
  headerUtilityRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 12
  },
  inlineAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  inlineActionPressed: {
    opacity: 0.72
  },
  inlineActionText: {
    fontSize: 14,
    lineHeight: 18,
    color: uiPalette.textSecondary
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
    maxWidth: 320,
    fontSize: 13,
    lineHeight: 18,
    color: uiPalette.textSecondary
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 12
  },
  emptyState: {
    marginTop: 6,
    gap: 14
  },
  emptyTitle: {
    fontSize: 30,
    lineHeight: 34,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily
  },
  emptyBody: {
    fontSize: 15,
    lineHeight: 22,
    color: uiPalette.textSecondary
  },
  sectionCard: {
    gap: 0
  },
  sectionTitle: {
    marginTop: 8,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "700",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily
  },
  sectionBody: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    color: uiPalette.textSecondary
  },
  summaryMetaRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8
  },
  summaryMetaText: {
    fontSize: 13,
    lineHeight: 18,
    color: uiPalette.textSecondary
  },
  summaryMetaDot: {
    fontSize: 13,
    lineHeight: 18,
    color: uiPalette.textMuted
  },
  bagList: {
    marginTop: 16,
    gap: 14
  },
  sectionDivider: {
    marginVertical: 18,
    height: 1,
    backgroundColor: uiPalette.border
  },
  primaryField: {
    marginTop: 16
  },
  fieldLabel: {
    marginBottom: 8,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: uiPalette.textSecondary,
    fontWeight: "700"
  },
  fieldInput: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: uiPalette.border,
    backgroundColor: uiPalette.surfaceStrong,
    paddingHorizontal: 14,
    color: uiPalette.text,
    fontSize: 16,
    lineHeight: 20
  },
  fieldHint: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
    color: uiPalette.textSecondary
  },
  bottomStatusStack: {
    gap: 12
  },
  bottomDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12
  }
});
