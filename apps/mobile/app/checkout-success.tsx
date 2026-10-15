import { useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassActionPill } from "../src/cart/GlassActionPill";
import { formatUsd, resolveMenuData, useMenuQuery, type MenuItem } from "../src/menu/catalog";
import { OrderItemThumbnail } from "../src/components/OrderItemThumbnail";
import { useCheckoutFlow, type CheckoutConfirmation } from "../src/orders/flow";
import { formatOrderDateTime } from "../src/orders/history";
import { formatOrderItemDescription } from "../src/orders/presentation";
import { uiPalette, uiTypography } from "../src/ui/system";
import { PickupCodePill, SummaryRow } from "../src/orders/CheckoutSuccessPrimitives";

function resolveConfirmationCopy(confirmation: CheckoutConfirmation | null) {
  if (!confirmation) {
    return {
      title: "Order Confirmed",
      body: "Your order has been placed. Visit the Orders tab to track your order and see all the details."
    };
  }

  if (confirmation.status === "PENDING_PAYMENT") {
    return {
      title: "Finalizing Payment",
      body: "Stripe accepted your payment details. We’ll mark the order paid as soon as the server receives Stripe’s verified confirmation."
    };
  }

  return {
    title: "Order Confirmed",
    body: "Your order is confirmed and already moving through the cafe."
  };
}

export default function CheckoutSuccessScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { confirmation, clearConfirmation } = useCheckoutFlow();
  const resolvedConfirmation = confirmation;
  const menuQuery = useMenuQuery();
  const menu = resolveMenuData(menuQuery.data);
  const menuItemsById = useMemo(
    () =>
      new Map((menu?.categories ?? []).flatMap((category) => category.items).map((item) => [item.id, item] as const)),
    [menu?.categories]
  );
  const resolvedItems = resolvedConfirmation?.items ?? [];
  const earnedPoints = resolvedConfirmation?.total.amountCents ?? 0;
  const confirmationCopy = resolveConfirmationCopy(resolvedConfirmation);

  useEffect(() => {
    return () => {
      clearConfirmation();
    };
  }, [clearConfirmation]);

  function goToOrders() {
    clearConfirmation();
    router.dismissTo("/(tabs)/orders");
  }

  function goToMenu() {
    clearConfirmation();
    router.dismissTo("/(tabs)/menu");
  }

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <ScrollView
          bounces
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={styles.scrollContent}
        >
          {resolvedConfirmation ? (
            <>
              <View style={styles.heroBlock}>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.title}>
                  {confirmationCopy.title}
                </Text>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.body}>
                  {confirmationCopy.body}
                </Text>
                <View style={styles.heroCodeRow}>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.heroCodeLabel}>
                    Pickup Code
                  </Text>
                  <PickupCodePill code={resolvedConfirmation.pickupCode} />
                </View>
              </View>

              <View style={[styles.pickupCodeStage, resolvedItems.length > 0 ? styles.pickupCodeStageWithItems : null]}>
                {resolvedItems.length > 0 ? (
                  <View style={styles.orderItemsBlock}>
                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.orderItemsLabel}>
                      Items
                    </Text>
                    {resolvedItems.map((item, index) => {
                      const menuItem = menuItemsById.get(item.itemId) as MenuItem | undefined;
                      const label = item.itemName ?? menuItem?.name ?? item.itemId;
                      const description = formatOrderItemDescription(item, menuItem);
                      const lineTotal = item.lineTotalCents ?? item.unitPriceCents * item.quantity;

                      return (
                        <View key={`${item.itemId}-${index}`} style={styles.menuLikeRow}>
                          <View style={styles.menuLikeRowMain}>
                            <OrderItemThumbnail
                              label={label}
                              imageUrl={menuItem?.imageUrl}
                              style={styles.menuLikeImage}
                            />
                            <View
                              style={[
                                styles.menuLikeBodyWrap,
                                index < resolvedItems.length - 1 ? styles.menuLikeBodyWrapWithDivider : null
                              ]}
                            >
                              <View style={styles.menuLikeBodyContent}>
                                <View style={styles.menuLikeCopy}>
                                  <View style={styles.menuLikeTitleRow}>
                                    <Text
                                      allowFontScaling={false}
                                      maxFontSizeMultiplier={1}
                                      style={styles.menuLikeTitle}
                                    >
                                      {label}
                                    </Text>
                                    <Text
                                      allowFontScaling={false}
                                      maxFontSizeMultiplier={1}
                                      style={styles.menuLikeMeta}
                                    >
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
                ) : null}
              </View>

              <View style={styles.summarySection}>
                <SummaryRow label="Placed" value={formatOrderDateTime(resolvedConfirmation.occurredAt)} />
                <SummaryRow label="Total" value={formatUsd(resolvedConfirmation.total.amountCents)} emphasized />
                <SummaryRow label="Points Earned" value={`${earnedPoints} pts`} emphasized />
              </View>
            </>
          ) : (
            <View style={styles.heroBlockEmpty}>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.title}>
                {confirmationCopy.title}
              </Text>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.body}>
                {confirmationCopy.body}
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={[styles.footerContent, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {resolvedConfirmation ? (
            <>
              <GlassActionPill label="Track Order" onPress={goToOrders} tone="dark" />
              <GlassActionPill label="Back to Menu" onPress={goToMenu} />
            </>
          ) : (
            <>
              <GlassActionPill label="View Orders" onPress={goToOrders} tone="dark" />
              <GlassActionPill label="Back to Menu" onPress={goToMenu} />
            </>
          )}
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
  scrollContent: {
    flex: 1
  },
  heroBlock: {
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border
  },
  heroBlockEmpty: {
    paddingBottom: 0
  },
  title: {
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  },
  body: {
    marginTop: 8,
    maxWidth: 520,
    fontSize: 15,
    lineHeight: 22,
    color: uiPalette.textSecondary
  },
  heroCodeRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  heroCodeLabel: {
    flex: 1,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: uiPalette.textMuted,
    fontWeight: "700"
  },
  pickupCodeStage: {
    justifyContent: "center"
  },
  pickupCodeStageWithItems: {
    paddingTop: 18,
    paddingBottom: 18,
    justifyContent: "flex-start"
  },
  orderItemsBlock: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center"
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
    backgroundColor: "#D5D4CE"
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
  footerContent: {
    marginTop: "auto",
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: uiPalette.border,
    gap: 12
  }
});
