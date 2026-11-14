import { useDeferredValue, useMemo } from "react";
import { useRouter } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { resolveMenuData, useMenuQuery, formatUsd } from "../menu/catalog";
import { OrderItemThumbnail } from "../components/OrderItemThumbnail";
import { ScreenState } from "../ui/ScreenState";
import { uiPalette } from "../ui/system";
import { useNativeScrollEdge } from "../navigation/useNativeScrollEdge";
import { nativeAppleHeaderCapabilities } from "../navigation/nativeAppleHeader";
import { searchCatalog } from "./catalogSearch";

export function CatalogSearchResults({ query }: { query: string }) {
  const router = useRouter();
  const menuQuery = useMenuQuery();
  const deferredQuery = useDeferredValue(query);
  const categories = resolveMenuData(menuQuery.data)?.categories;
  const results = useMemo(() => searchCatalog(categories ?? [], deferredQuery), [categories, deferredQuery]);
  const registerScrollEdge = useNativeScrollEdge(nativeAppleHeaderCapabilities().available);
  const empty = menuQuery.isLoading ? <ScreenState title="Loading menu" message="Finding the latest items for this location." loading />
    : menuQuery.isError ? <ScreenState title="Menu unavailable" message="We couldn’t load this location’s menu. Try again." actionLabel="Retry" onAction={() => { void menuQuery.refetch(); }} />
    : !query.trim() ? <ScreenState title="Find your next favorite" message="Search drinks and food by name, ingredient, or category." />
    : <ScreenState title="No matches" message="Try another name or a shorter search." />;
  return <FlatList
    style={styles.screen} contentContainerStyle={styles.content}
    data={menuQuery.isError || !query.trim() ? [] : results} keyExtractor={({ item }) => item.id}
    onLayout={registerScrollEdge} contentInsetAdjustmentBehavior="automatic"
    keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
    ListEmptyComponent={empty}
    renderItem={({ item: result }) => <Pressable
      accessibilityRole="button" accessibilityLabel={`${result.item.name}, ${formatUsd(result.item.priceCents)}${result.item.available ? "" : ", unavailable"}`}
      accessibilityState={{ disabled: !result.item.available }} disabled={!result.item.available}
      onPress={() => router.push({ pathname: "/menu-customize", params: { itemId: result.item.id } })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <OrderItemThumbnail label={result.item.name} imageUrl={result.item.imageUrl} size="small" fallbackSymbol={{ ios: "cup.and.saucer", android: "local_cafe" }} />
      <View style={styles.copy}>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.name}>{result.item.name}</Text>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.secondary}>{result.item.available ? result.category : "Currently unavailable"}</Text>
      </View>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.price}>{formatUsd(result.item.priceCents)}</Text>
      <SymbolView name={{ ios: "chevron.right", android: "chevron_right" }} size={12} tintColor={uiPalette.textSecondary} />
    </Pressable>} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: uiPalette.background }, content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 160 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, minHeight: 80, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: uiPalette.border },
  pressed: { opacity: 0.6 }, copy: { flex: 1, minWidth: 0, gap: 5 },
  name: { fontSize: 17, fontWeight: "600", color: uiPalette.text },
  secondary: { fontSize: 14, color: uiPalette.textSecondary }, price: { fontSize: 16, color: uiPalette.text }
});
