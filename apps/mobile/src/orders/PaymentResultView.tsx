import { SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, uiPalette } from "../ui/system";
import { NativeCornerView } from "../ui/NativeCornerView";
import type { CheckoutConfirmation, CheckoutFailure } from "./flow";
import { confirmationPresentation, failurePresentation } from "./paymentResult";
import { formatUsd } from "../menu/catalog";
import { formatOrderDateTime } from "./history";
import { formatOrderItemDescription } from "./presentation";

export function ResultGroup({ children }: { children: ReactNode }) {
  return <NativeCornerView cornerMode="fixed" fallbackRadius={20} style={styles.group}>{children}</NativeCornerView>;
}

export function ResultField({ label, value }: { label: string; value: string }) {
  return <View style={styles.field}>
    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.secondary}>{label}</Text>
    <Text allowFontScaling={false} maxFontSizeMultiplier={1} selectable style={styles.value}>{value}</Text>
  </View>;
}

export function PaymentResultView({ confirmation = null, failure = null, pending = false, kind, onPrimary, onSecondary }: {
  kind: "confirmation" | "failure"; confirmation?: CheckoutConfirmation | null; failure?: CheckoutFailure | null;
  pending?: boolean; onPrimary: () => void; onSecondary: () => void;
}) {
  const insets = useSafeAreaInsets();
  const presentation = kind === "confirmation" ? confirmationPresentation(confirmation, pending) : failurePresentation(failure);
  const confirmed = kind === "confirmation" && confirmationPresentation(confirmation, pending).confirmed;
  return <View style={styles.screen}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <SymbolView name={{ ios: kind === "failure" ? "exclamationmark.circle" : confirmed ? "checkmark.circle" : "clock", android: kind === "failure" ? "error_outline" : confirmed ? "check_circle" : "schedule" }} size={52} tintColor={uiPalette.text} />
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} accessibilityRole="header" style={styles.title}>{presentation.title}</Text>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.message}>{presentation.message}</Text>
      </View>
      {confirmation ? <>
        {confirmed ? <ResultGroup><ResultField label="Pickup code" value={confirmation.pickupCode} /></ResultGroup> : null}
        <ResultGroup>
          {confirmation.items.map((item, index) => <View key={`${item.itemId}-${index}`} style={styles.item}>
            <View style={styles.itemHeading}>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.itemName}>{item.itemName?.trim() || "Item"}</Text>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.value}>{formatUsd(item.lineTotalCents ?? item.unitPriceCents * item.quantity)}</Text>
            </View>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.secondary}>{formatOrderItemDescription(item)}</Text>
          </View>)}
          <ResultField label="Total" value={formatUsd(confirmation.total.amountCents)} />
          <ResultField label="Placed" value={formatOrderDateTime(confirmation.occurredAt)} />
        </ResultGroup>
      </> : null}
      {failure?.message ? <ResultGroup><ResultField label="What happened" value={failure.message} /></ResultGroup> : null}
    </ScrollView>
    <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <Button label={kind === "failure" ? "Return to cart" : confirmed ? "Track order" : "View orders"} onPress={onPrimary} />
      <Button label={kind === "failure" ? "View orders" : "Back to menu"} variant="secondary" onPress={onSecondary} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: uiPalette.backgroundAlt },
  content: { padding: 20, paddingBottom: 28, gap: 20 },
  hero: { alignItems: "center", gap: 16, paddingVertical: 28, paddingHorizontal: 8 },
  title: { color: uiPalette.text, fontSize: 28, lineHeight: 34, fontWeight: "700", textAlign: "center" },
  message: { color: uiPalette.textSecondary, fontSize: 17, lineHeight: 24, textAlign: "center", maxWidth: 420 },
  group: { backgroundColor: uiPalette.card, overflow: "hidden" },
  field: { padding: 16, gap: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: uiPalette.border },
  secondary: { color: uiPalette.textSecondary, fontSize: 15, lineHeight: 21 },
  value: { color: uiPalette.text, fontSize: 17, lineHeight: 23 },
  item: { padding: 16, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: uiPalette.border },
  itemHeading: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  itemName: { color: uiPalette.text, fontSize: 17, lineHeight: 23, fontWeight: "600", flex: 1 },
  actions: { paddingHorizontal: 20, paddingTop: 12, gap: 10 }
});
