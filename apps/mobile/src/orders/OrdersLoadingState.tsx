import { ScrollView, StyleSheet, View } from "react-native";
import { SkeletonBlock, SkeletonPulse } from "../ui/Skeleton";

/** Match the current year/month archive rather than the removed full-page Orders layout. */
export function OrdersLoadingState({ contentTopInset, contentBottomInset }: { contentTopInset: number; contentBottomInset: number }) {
  return <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="never" scrollEnabled={false}
    accessibilityLabel="Loading orders" accessibilityState={{ busy: true }}
    contentContainerStyle={{ paddingHorizontal: 16, paddingTop: contentTopInset, paddingBottom: contentBottomInset }}>
    <SkeletonPulse>
      <SkeletonBlock width={80} height={24} />
      <View style={styles.group}>{[0, 1, 2].map((index) => <View key={index} style={styles.row}>
        <SkeletonBlock width={48} height={48} radius={12} />
        <View style={styles.copy}><SkeletonBlock width="55%" height={18} /><SkeletonBlock width="30%" height={14} /></View>
      </View>)}</View>
    </SkeletonPulse>
  </ScrollView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" }, group: { gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12 }, copy: { flex: 1, gap: 10 }
});
