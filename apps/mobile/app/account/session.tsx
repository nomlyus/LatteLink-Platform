import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuthSession } from "../../src/auth/session";
import { formatDateTime } from "../../src/account/presentation";
import { resolveAppConfigData, useAppConfigQuery } from "../../src/menu/catalog";
import { ScreenState } from "../../src/ui/ScreenState";
import { uiPalette } from "../../src/ui/system";
import { ResultField, ResultGroup } from "../../src/orders/PaymentResultView";

export default function SessionPage() {
  const router = useRouter();
  const { isAuthenticated, session } = useAuthSession();
  const config = resolveAppConfigData(useAppConfigQuery().data);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
    {!isAuthenticated ? <ScreenState title="Sign in to your account" message="Your session has ended. Sign in again to see your orders and rewards."
      actionLabel="Open account" onAction={() => router.push("/(tabs)/account")} />
      : <>
        <View style={styles.hero}>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.title}>You’re signed in</Text>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.body}>Your account is securely connected on this device.</Text>
        </View>
        <ResultGroup>
          <ResultField label="Brand" value={config?.brand.brandName ?? "Unavailable"} />
          <ResultField label="Location" value={config?.brand.locationName ?? "Unavailable"} />
          <ResultField label="Session expires" value={session?.expiresAt ? formatDateTime(session.expiresAt) : "Unavailable"} />
        </ResultGroup>
      </>}
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 24 }, hero: { gap: 10 },
  title: { color: uiPalette.text, fontSize: 28, fontWeight: "700" },
  body: { color: uiPalette.textSecondary, fontSize: 16, lineHeight: 23 }
});
