import { useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { OrderHistoryEntry } from "../account/data";
import { resolveMenuData, useMenuQuery } from "../menu/catalog";
import { uiPalette } from "../ui/system";
import { OrderArchiveRow } from "./OrderArchiveRow";

export function OrdersSearchResults({ orders }: { orders: OrderHistoryEntry[] }) {
  const router = useRouter();
  const menuQuery = useMenuQuery();
  const menu = resolveMenuData(menuQuery.data);
  const menuItemsById = useMemo(() => new Map((menu?.categories ?? []).flatMap((category) => category.items).map((item) => [item.id, item])), [menu?.categories]);
  if (!orders.length) return <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.empty}>No matching orders.</Text>;
  return <View style={styles.group}>
    {orders.map((order, index) => <View key={order.id}>
      {index > 0 ? <View style={styles.separator} /> : null}
      <OrderArchiveRow order={order} menuItemsById={menuItemsById}
        onPress={() => router.push({ pathname: "/(tabs)/orders/detail", params: { orderId: order.id } })} />
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  group: { marginTop: 28, borderRadius: 26, overflow: "hidden", backgroundColor: uiPalette.surfaceStrong },
  separator: { marginHorizontal: 16, height: StyleSheet.hairlineWidth, backgroundColor: uiPalette.border },
  empty: { marginTop: 28, color: uiPalette.textSecondary, textAlign: "center" }
});
