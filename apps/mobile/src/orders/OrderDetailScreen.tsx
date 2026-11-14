import { Stack, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useMemo } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLoyaltyLedgerQuery, useOrderHistoryQuery } from "../account/data";
import { useAuthSession } from "../auth/session";
import { resolveAppConfigData, resolveMenuData, useAppConfigQuery, useMenuQuery } from "../menu/catalog";
import { ScreenState } from "../ui/ScreenState";
import { findLoyaltyReversalEntriesForOrder } from "./history";
import { renderOrderReceipt, orderReceiptStyles as styles } from "./OrderReceipt";

/** The same authenticated receipt is used inside History and by compatibility deep links. */
export function OrderDetailScreen({ orderId, headerOverlay = true }: { orderId: string | undefined; headerOverlay?: boolean }) {
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuthSession();
  const ordersQuery = useOrderHistoryQuery(isAuthenticated);
  const ledgerQuery = useLoyaltyLedgerQuery(isAuthenticated);
  const menuQuery = useMenuQuery();
  const configQuery = useAppConfigQuery();
  const order = isAuthenticated ? ordersQuery.data?.find((entry) => entry.id === orderId) : undefined;
  const menu = resolveMenuData(menuQuery.data);
  const menuItemsById = useMemo(() => new Map((menu?.categories ?? []).flatMap((category) => category.items).map((item) => [item.id, item])), [menu?.categories]);
  const brandName = resolveAppConfigData(configQuery.data)?.brand.brandName ?? "Your order";
  const reversals = orderId && !ledgerQuery.isError ? findLoyaltyReversalEntriesForOrder(orderId, ledgerQuery.data ?? []) : [];
  const message = !isAuthenticated ? "Sign in to view this order." : ordersQuery.isLoading ? "Loading order details…" : ordersQuery.error ? "Unable to load order details." : !order ? "Order not found." : null;
  return <>
    <Stack.Screen options={{ title: "", headerLargeTitleEnabled: false }} />
    <ScrollView contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false}
      style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: headerOverlay ? headerHeight + 12 : 12, paddingBottom: insets.bottom + 24 }]}>
      {message ? <ScreenState title={message}
        message={ordersQuery.isLoading ? "Getting the latest information." : !isAuthenticated ? "Your order history is private to your account." : ordersQuery.error ? "Check your connection and try again." : "Open Orders to see your latest purchases."}
        loading={isAuthenticated && ordersQuery.isLoading}
        actionLabel={!isAuthenticated ? "Sign In" : ordersQuery.error ? "Retry" : !ordersQuery.isLoading ? "View orders" : undefined}
        onAction={!isAuthenticated ? () => router.push({ pathname: "/auth", params: { returnTo: "/(tabs)/orders" } })
          : ordersQuery.error ? () => { void ordersQuery.refetch(); } : () => router.dismissTo("/(tabs)/orders")} />
        : order ? renderOrderReceipt({ order, brandName, menuItemsById, reversals }) : null}
    </ScrollView>
  </>;
}
