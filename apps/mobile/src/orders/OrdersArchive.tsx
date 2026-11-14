import { SymbolView } from "expo-symbols";
import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { OrderHistoryEntry } from "../account/data";
import { uiPalette } from "../ui/system";
import { groupOrdersByMonth, searchArchivedOrders } from "./archive";
import { OrdersSearchResults } from "./OrdersSearchResults";

export function OrdersArchive({ orders }: { orders: OrderHistoryEntry[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const months = useMemo(() => groupOrdersByMonth(orders), [orders]);
  const matches = useMemo(() => searchArchivedOrders(orders, query), [orders, query]);
  const isSearching = query.trim().length > 0;
  const years = [...new Set(months.map((month) => month.year))];
  return <>
    <Stack.Screen options={{ headerSearchBarOptions: {
      placeholder: "Search orders", placement: "automatic", allowToolbarIntegration: true,
      hideWhenScrolling: false, onChangeText: (event) => setQuery(event.nativeEvent.text),
      onCancelButtonPress: () => setQuery("")
    } }} />
    {isSearching ? <OrdersSearchResults orders={matches} /> : years.map((year) => <View key={year} style={styles.section}>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.year}>{year}</Text>
      <View style={styles.group}>
        {months.filter((month) => month.year === year).map((month, index) => <View key={month.key}>
          {index > 0 ? <View style={styles.separator} /> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`${month.title} ${year}, ${month.orders.length} orders`}
            onPress={() => router.push({ pathname: "/(tabs)/orders/month", params: { month: month.key } })}
            style={styles.row}>
            <View style={styles.icon}><SymbolView name={{ ios: "shippingbox", android: "inventory_2" }} size={27} tintColor={uiPalette.textSecondary} /></View>
            <View style={styles.copy}>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.month}>{month.title}</Text>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.count}>{month.orders.length} {month.orders.length === 1 ? "Order" : "Orders"}</Text>
            </View>
            <SymbolView name={{ ios: "chevron.right", android: "chevron_right" }} size={14} weight="semibold" tintColor={uiPalette.textSecondary} />
          </Pressable>
        </View>)}
      </View>
    </View>)}
  </>;
}

const styles = StyleSheet.create({
  section: { marginTop: 28 },
  year: { fontSize: 22, fontWeight: "700", color: uiPalette.textSecondary, marginHorizontal: 16, marginBottom: 14 },
  group: { borderRadius: 26, overflow: "hidden", backgroundColor: uiPalette.surfaceStrong },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 15, minHeight: 82 },
  icon: { width: 46, height: 46, borderRadius: 12, backgroundColor: uiPalette.background, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 4 },
  month: { fontSize: 17, fontWeight: "600", color: uiPalette.text },
  count: { fontSize: 15, color: uiPalette.textSecondary },
  separator: { marginHorizontal: 16, height: StyleSheet.hairlineWidth, backgroundColor: uiPalette.border },
});
