import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Image, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GlassActionPill } from "../src/cart/GlassActionPill";
import { formatUsd, resolveMenuData, resolveMenuImageUrl, useMenuQuery, type MenuItem } from "../src/menu/catalog";
import { useCheckoutFlow, type CheckoutConfirmation } from "../src/orders/flow";
import { formatOrderDateTime } from "../src/orders/history";
import { uiPalette, uiTypography } from "../src/ui/system";

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
    haystack.includes("cappuccino") ||
    haystack.includes("cortado")
  ) {
    return "cafe-outline" as const;
  }

  return "sparkles-outline" as const;
}

function OrderItemThumbnail({
  label,
  imageUrl
}: {
  label: string;
  imageUrl?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const optimizedImageUrl = resolveMenuImageUrl(imageUrl, "list");
  const [activeImageUrl, setActiveImageUrl] = useState(optimizedImageUrl);

  useEffect(() => {
    setImageFailed(false);
    setActiveImageUrl(optimizedImageUrl);
  }, [optimizedImageUrl]);

  return (
    <View style={styles.menuLikeImage}>
      {activeImageUrl && !imageFailed ? (
        <Image
          source={{ uri: activeImageUrl }}
          style={styles.menuLikeImagePhoto}
          resizeMode="cover"
          onError={() => {
            if (imageUrl && activeImageUrl !== imageUrl) {
              setActiveImageUrl(imageUrl);
              return;
            }
            setImageFailed(true);
          }}
        />
      ) : (
        <Ionicons name={resolveOrderItemIcon(label)} size={22} color={uiPalette.accent} />
      )}
    </View>
  );
}

function formatOrderItemDescription(item: CheckoutConfirmation["items"][number], menuItem?: MenuItem) {
  const selectedOptions = item.customization?.selectedOptions?.map((selection) => selection.optionLabel).filter(Boolean) ?? [];
  const notes = item.customization?.notes?.trim();
  const details = [...selectedOptions, ...(notes ? [notes] : [])];
  const suffix = details.length > 0 ? details.join(" • ") : menuItem?.description?.trim() ?? "";
  return suffix.length > 0 ? `${item.quantity}x • ${suffix}` : `${item.quantity}x`;
}

function canUseLiquidGlass() {
  if (Platform.OS !== "ios") return false;

  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

function PickupCodePill({ code }: { code: string }) {
  const useLiquidGlass = canUseLiquidGlass();

  return (
    <View style={styles.pickupCodePillShell}>
      {useLiquidGlass ? (
        <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.pickupCodePillFrame} />
      ) : (
        <BlurView tint="light" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.pickupCodePillFrame} />
      )}
      <View pointerEvents="none" style={styles.pickupCodePillContent}>
        <Text style={styles.pickupCodePillText}>{code}</Text>
      </View>
    </View>
  );
}

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

function SummaryRow({
  label,
  value,
  emphasized = false
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, emphasized ? styles.summaryValueStrong : null]}>{value}</Text>
    </View>
  );
}

export default function CheckoutSuccessScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { confirmation, clearConfirmation } = useCheckoutFlow();
  const resolvedConfirmation = confirmation;
  const menuQuery = useMenuQuery();
  const menu = resolveMenuData(menuQuery.data);
  const menuItemsById = useMemo(
    () => new Map((menu?.categories ?? []).flatMap((category) => category.items).map((item) => [item.id, item] as const)),
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
                <Text style={styles.title}>{confirmationCopy.title}</Text>
                <Text style={styles.body}>{confirmationCopy.body}</Text>
                <View style={styles.heroCodeRow}>
                  <Text style={styles.heroCodeLabel}>Pickup Code</Text>
                  <PickupCodePill code={resolvedConfirmation.pickupCode} />
                </View>
              </View>

              <View style={[styles.pickupCodeStage, resolvedItems.length > 0 ? styles.pickupCodeStageWithItems : null]}>
                {resolvedItems.length > 0 ? (
                  <View style={styles.orderItemsBlock}>
                    <Text style={styles.orderItemsLabel}>Items</Text>
                    {resolvedItems.map((item, index) => {
                      const menuItem = menuItemsById.get(item.itemId) as MenuItem | undefined;
                      const label = item.itemName ?? menuItem?.name ?? item.itemId;
                      const description = formatOrderItemDescription(item, menuItem);
                      const lineTotal = item.lineTotalCents ?? item.unitPriceCents * item.quantity;

                      return (
                        <View key={`${item.itemId}-${index}`} style={styles.menuLikeRow}>
                          <View style={styles.menuLikeRowMain}>
                            <OrderItemThumbnail label={label} imageUrl={menuItem?.imageUrl} />
                            <View style={[styles.menuLikeBodyWrap, index < resolvedItems.length - 1 ? styles.menuLikeBodyWrapWithDivider : null]}>
                              <View style={styles.menuLikeBodyContent}>
                                <View style={styles.menuLikeCopy}>
                                  <View style={styles.menuLikeTitleRow}>
                                    <Text style={styles.menuLikeTitle}>{label}</Text>
                                    <Text style={styles.menuLikeMeta}>{formatUsd(lineTotal)}</Text>
                                  </View>
                                  <Text numberOfLines={3} style={styles.menuLikeDescription}>
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
              <Text style={styles.title}>{confirmationCopy.title}</Text>
              <Text style={styles.body}>{confirmationCopy.body}</Text>
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
  pickupCodePillShell: {
    position: "relative",
    alignSelf: "flex-start",
    borderRadius: 999,
    overflow: "hidden"
  },
  pickupCodePillFrame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    overflow: "hidden"
  },
  pickupCodePillContent: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center"
  },
  pickupCodePillText: {
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 1.3,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
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
    backgroundColor: "#D5D4CE",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  menuLikeImagePhoto: {
    width: "100%",
    height: "100%"
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
  summaryRow: {
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  summaryLabel: {
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.textSecondary
  },
  summaryValue: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.text,
    textAlign: "right"
  },
  summaryValueStrong: {
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase"
  },
  footerContent: {
    marginTop: "auto",
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: uiPalette.border,
    gap: 12
  }
});
