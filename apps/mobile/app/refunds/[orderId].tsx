import { useRouter, useLocalSearchParams } from "expo-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { LoyaltyLedgerEntry, OrderHistoryEntry } from "../../src/account/data";
import { useLoyaltyLedgerQuery, useOrderHistoryQuery } from "../../src/account/data";
import { useAuthSession } from "../../src/auth/session";
import { GlassActionPill } from "../../src/cart/GlassActionPill";
import { formatUsd, resolveMenuData, resolveMenuImageUrl, useMenuQuery, type MenuItem } from "../../src/menu/catalog";
import { findRefundEntriesForOrder, formatOrderStatus } from "../../src/orders/history";
import { Button, ScreenScroll, uiPalette, uiTypography } from "../../src/ui/system";

function sumReturnedPoints(entries: LoyaltyLedgerEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.points, 0);
}

function buildHeadline(order: OrderHistoryEntry, refundEntries: LoyaltyLedgerEntry[]) {
  if (refundEntries.length > 0) {
    return {
      title: "Refund Posted"
    };
  }

  if (order.status === "CANCELED") {
    return {
      title: "Order Canceled"
    };
  }

  return {
    title: "Order Updated"
  };
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

function formatOrderItemDescription(item: OrderHistoryEntry["items"][number], menuItem?: MenuItem) {
  const selectedOptions = item.customization?.selectedOptions?.map((selection) => selection.optionLabel).filter(Boolean) ?? [];
  const notes = item.customization?.notes?.trim();
  const details = [...selectedOptions, ...(notes ? [notes] : [])];
  const suffix = details.length > 0 ? details.join(" • ") : menuItem?.description?.trim() ?? "";
  return suffix.length > 0 ? `${item.quantity}x • ${suffix}` : `${item.quantity}x`;
}

function canUseLiquidGlassStatusPill() {
  if (Platform.OS !== "ios") return false;

  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

function SummaryStatusPill({
  status
}: {
  status: OrderHistoryEntry["status"];
}) {
  const label = formatOrderStatus(status);
  const useLiquidGlass = canUseLiquidGlassStatusPill();

  return (
    <View style={styles.statusPillShell}>
      {useLiquidGlass ? (
        <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.statusPillFrame} />
      ) : (
        <BlurView tint="light" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.statusPillFrame} />
      )}
      <View pointerEvents="none" style={styles.statusPillContent}>
        <Text style={styles.statusPillText}>{label}</Text>
      </View>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  emphasized = false
}: {
  label: string;
  value: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      {typeof value === "string" ? <Text style={[styles.summaryValue, emphasized ? styles.summaryValueStrong : null]}>{value}</Text> : value}
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
    <ScreenScroll bottomInset={48}>
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>{title}</Text>
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
    () => new Map((menu?.categories ?? []).flatMap((category) => category.items).map((item) => [item.id, item] as const)),
    [menu?.categories]
  );

  const order = (ordersQuery.data ?? []).find((entry) => entry.id === orderId);
  const refundEntries = orderId ? findRefundEntriesForOrder(orderId, loyaltyLedgerQuery.data ?? []) : [];

  const headline = order ? buildHeadline(order, refundEntries) : null;
  const returnedPoints = useMemo(() => sumReturnedPoints(refundEntries), [refundEntries]);

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
            <Text style={styles.title}>{headline?.title}</Text>
          </View>

          <View style={styles.orderItemsStage}>
            <View style={styles.orderItemsBlock}>
              <Text style={styles.orderItemsLabel}>Items</Text>
              {order.items.map((item, index) => {
                const menuItem = menuItemsById.get(item.itemId) as MenuItem | undefined;
                const label = item.itemName ?? menuItem?.name ?? item.itemId;
                const description = formatOrderItemDescription(item, menuItem);
                const lineTotal = item.lineTotalCents ?? item.unitPriceCents * item.quantity;

                return (
                  <View key={`${item.itemId}-${index}`} style={styles.menuLikeRow}>
                    <View style={styles.menuLikeRowMain}>
                      <OrderItemThumbnail label={label} imageUrl={menuItem?.imageUrl} />
                      <View style={[styles.menuLikeBodyWrap, index < order.items.length - 1 ? styles.menuLikeBodyWrapWithDivider : null]}>
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
          </View>

          <View style={styles.summarySection}>
            <SummaryRow label="Status" value={<SummaryStatusPill status={order.status} />} />
            <SummaryRow label="Total" value={formatUsd(order.total.amountCents)} emphasized />
            <SummaryRow label="Points Returned" value={returnedPoints > 0 ? `${returnedPoints} pts` : "--"} emphasized />
          </View>
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
    fontWeight: "700",
    color: uiPalette.text
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
