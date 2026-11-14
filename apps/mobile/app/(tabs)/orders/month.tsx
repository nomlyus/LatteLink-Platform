import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useOrderHistoryQuery } from "../../../src/account/data";
import { useAuthSession } from "../../../src/auth/session";
import { resolveMenuData, useMenuQuery } from "../../../src/menu/catalog";
import { groupOrdersByMonth } from "../../../src/orders/archive";
import { OrderArchiveRow } from "../../../src/orders/OrderArchiveRow";
import { Button, ScreenScroll, uiPalette } from "../../../src/ui/system";

export default function OrdersMonthRoute() {
  const { month: key } = useLocalSearchParams<{ month: string }>();
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const { isAuthenticated, isHydrating } = useAuthSession();
  const ordersQuery = useOrderHistoryQuery(isAuthenticated);
  const menuQuery = useMenuQuery();
  const menu = resolveMenuData(menuQuery.data);
  const menuItemsById = useMemo(() => new Map((menu?.categories ?? []).flatMap((category) => category.items).map((item) => [item.id, item])), [menu?.categories]);
  const month = groupOrdersByMonth(isAuthenticated ? ordersQuery.data ?? [] : []).find((group) => group.key === key);
  const message = isHydrating || ordersQuery.isLoading ? "Loading orders…" : !isAuthenticated ? "Sign in to view your orders." : ordersQuery.error ? "Unable to load orders." : !month ? "No orders for this month." : null;
  return <>
    <Stack.Screen options={{ title: month ? `${month.title} ${month.year === "Other orders" ? "" : month.year}`.trim() : "Orders" }} />
    <ScreenScroll transparent bottomInset={24} contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingTop: headerHeight + 12 }}>
      {message ? <View style={styles.message}><Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.text}>{message}</Text>
        {isAuthenticated && ordersQuery.error ? <Button label="Retry" onPress={() => { void ordersQuery.refetch(); }} /> : null}
      </View> : <View style={styles.group}>{month?.orders.map((order, index) => <View key={order.id}>
        {index > 0 ? <View style={styles.separator} /> : null}
        <OrderArchiveRow order={order} menuItemsById={menuItemsById}
          onPress={() => router.push({ pathname: "/(tabs)/orders/detail", params: { orderId: order.id } })} />
      </View>)}</View>}
    </ScreenScroll>
  </>;
}

const styles = StyleSheet.create({
  message: { paddingVertical: 24, gap: 16 }, text: { color: uiPalette.textSecondary },
  group: { borderRadius: 26, overflow: "hidden", backgroundColor: uiPalette.surfaceStrong, marginTop: 24 },
  separator: { marginHorizontal: 16, height: StyleSheet.hairlineWidth, backgroundColor: uiPalette.border }
});
