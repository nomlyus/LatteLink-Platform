import { ScrollView, StyleSheet, View } from "react-native";
import { SkeletonBlock, SkeletonPulse } from "../ui/Skeleton";
import { uiPalette } from "../ui/systemColors";

export function LoadingMenuState({ contentTopInset, contentBottomInset }: { contentTopInset: number; contentBottomInset: number }) {
  return <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="never" scrollEnabled={false}
    accessibilityLabel="Loading menu" accessibilityState={{ busy: true }}
    contentContainerStyle={{ paddingHorizontal: 20, paddingTop: contentTopInset, paddingBottom: contentBottomInset }}>
    <SkeletonPulse>
      <SkeletonBlock width={120} height={20} />
      {[0, 1, 2, 3].map((index) => <View key={index} style={styles.row}>
        <SkeletonBlock width={108} height={132} radius={0} />
        <View style={styles.copy}>
          <View style={styles.heading}><SkeletonBlock width="58%" height={18} /><SkeletonBlock width={44} height={18} /></View>
          <SkeletonBlock height={12} /><SkeletonBlock width="70%" height={12} />
        </View>
      </View>)}
    </SkeletonPulse>
  </ScrollView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: uiPalette.background }, row: { flexDirection: "row", alignItems: "center", gap: 16 },
  copy: { flex: 1, gap: 10 }, heading: { flexDirection: "row", justifyContent: "space-between", gap: 10 }
});
