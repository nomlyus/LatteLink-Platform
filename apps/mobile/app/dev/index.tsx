import { Stack, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { designPreviewScenarios } from "../../src/dev/designPreviews";
import { designPreviewsEnabled } from "../../src/dev/previewEnabled";
import { ResultGroup } from "../../src/orders/PaymentResultView";
import { uiPalette } from "../../src/ui/system";

export default function DesignPreviews() {
  const router = useRouter();
  if (!designPreviewsEnabled) return null;
  return <>
    <Stack.Screen options={{ unstable_headerLeftItems: () => [{ type: "button", label: "Close", icon: { type: "sfSymbol", name: "xmark" }, onPress: () => router.dismiss() }] }} />
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.note}>Development only. Sample states use the real presentation components, without placing orders, charging, signing in, or changing account data. Use your phone’s appearance setting to compare light and dark.</Text>
      <ResultGroup>{designPreviewScenarios.map((scenario) => <Pressable key={scenario.id} accessibilityRole="button"
        onPress={() => router.push({ pathname: "/dev/[scenario]", params: { scenario: scenario.id } })} style={styles.row}>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.label}>{scenario.label}</Text>
        <SymbolView name={{ ios: "chevron.right", android: "chevron_right" }} size={14} tintColor={uiPalette.textSecondary} />
      </Pressable>)}</ResultGroup>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.note}>Live screens below use your current session. Opening them is read-only; account edits and destructive actions still require your input.</Text>
      <View style={styles.links}>
        <Pressable accessibilityRole="button" style={styles.row} onPress={() => router.dismissTo("/(tabs)/account")}><Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.label}>Account and subpages</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.row} onPress={() => router.dismissTo("/(tabs)/orders")}><Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.label}>Orders and history</Text></Pressable>
      </View>
    </ScrollView>
  </>;
}
const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 20 }, note: { color: uiPalette.textSecondary, fontSize: 15, lineHeight: 22 },
  row: { padding: 16, minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: uiPalette.border },
  label: { flex: 1, color: uiPalette.text, fontSize: 17 }, links: { backgroundColor: uiPalette.card, borderRadius: 20 }
});
