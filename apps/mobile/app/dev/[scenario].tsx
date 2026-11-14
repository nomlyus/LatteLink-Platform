import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { designPreviewsEnabled } from "../../src/dev/previewEnabled";
import { designPreviewScenarios, isDesignPreviewScenario, previewConfirmation, previewFailure, previewOrder, previewRewardsBalance, previewRewardsEntries } from "../../src/dev/designPreviews";
import { PaymentResultView } from "../../src/orders/PaymentResultView";
import { RewardsOverview } from "../../src/account/RewardsOverview";
import { renderOrderReceipt } from "../../src/orders/OrderReceipt";
import { ScreenState } from "../../src/ui/ScreenState";
import { uiPalette } from "../../src/ui/system";
import { ProfileSetupPreview } from "../../src/dev/ProfileSetupPreview";
import { CustomizeModalLoadingSheet } from "../../src/menu/CustomizeModalLoadingSheet";
import { LoadingMenuState } from "../../src/menu/MenuLoadingState";
import { OrdersLoadingState } from "../../src/orders/OrdersLoadingState";
import { SimpleModalState } from "../../src/menu/MenuCustomizeStates";
import { DeleteAccountPreview } from "../../src/dev/DeleteAccountPreview";

export default function DesignPreviewScenario() {
  const params = useLocalSearchParams<{ scenario: string }>();
  const router = useRouter();
  if (!designPreviewsEnabled) return null;
  const scenario = params.scenario;
  if (!isDesignPreviewScenario(scenario)) return <ScreenState title="Preview not found" message="Choose a screen from Design previews." />;
  const back = () => router.back();
  const content = scenario === "confirmation" || scenario === "payment-pending"
    ? <PaymentResultView kind="confirmation" confirmation={scenario === "confirmation" ? previewConfirmation : null} pending={scenario === "payment-pending"} onPrimary={back} onSecondary={back} />
    : scenario === "payment-failed" || scenario === "checkout-unavailable"
      ? <PaymentResultView kind="failure" failure={scenario === "payment-failed" ? previewFailure : { ...previewFailure, stage: "quote", message: "This location is temporarily unable to accept orders." }} onPrimary={back} onSecondary={back} />
      : ["tracking-paid", "tracking-preparing", "tracking-ready", "receipt", "canceled", "refund"].includes(scenario)
        ? <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.receipt}>{renderOrderReceipt({ order: previewOrder(scenario), brandName: "Sample café" })}</ScrollView>
        : scenario === "profile" ? <ProfileSetupPreview onContinue={back} />
        : scenario === "account-delete" ? <DeleteAccountPreview />
        : scenario === "item-loading" ? <CustomizeModalLoadingSheet />
        : scenario === "menu-loading" ? <LoadingMenuState contentTopInset={16} contentBottomInset={24} />
        : scenario === "orders-loading" ? <OrdersLoadingState contentTopInset={16} contentBottomInset={24} />
        : scenario === "item-unavailable" ? <SimpleModalState title="Item unavailable" body="This item isn’t available at the selected location right now." actionLabel="Back to previews" onAction={back} />
        : scenario.startsWith("rewards") ? <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.receipt}>
          <RewardsOverview enabled balance={scenario === "rewards-empty" ? { ...previewRewardsBalance, availablePoints: 0, pendingPoints: 0, lifetimeEarned: 0 } : previewRewardsBalance}
            entries={scenario === "rewards-empty" ? [] : previewRewardsEntries}
            balanceState={scenario === "rewards-error" ? "error" : scenario === "rewards-loading" ? "loading" : "ready"}
            activityState={scenario === "rewards-error" ? "error" : scenario === "rewards-loading" ? "loading" : "ready"} onRetry={back} />
        </ScrollView>
        : <ScreenState title={scenario === "loading" ? "Loading your orders" : scenario === "error" ? "Orders unavailable" : scenario === "signed-out" ? "Your orders, in one place" : "No orders yet"}
          message={scenario === "loading" ? "Getting the latest information." : scenario === "error" ? "We couldn’t connect. Your order history will appear once the connection is restored." : scenario === "signed-out" ? "Sign in to see your past orders and follow your next pickup." : "Your first order will appear here."}
          loading={scenario === "loading"} actionLabel={scenario === "loading" ? undefined : "Back to previews"} onAction={back} />;
  return <View style={styles.screen}>
    <Stack.Screen options={{ title: designPreviewScenarios.find((entry) => entry.id === scenario)?.label }} />
    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.banner}>PREVIEW · Sample data · Actions return to gallery</Text>
    {content}
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, receipt: { padding: 20, paddingBottom: 40, gap: 24 },
  banner: { fontSize: 12, lineHeight: 18, paddingHorizontal: 16, paddingVertical: 8, color: uiPalette.textSecondary, backgroundColor: uiPalette.card }
});
