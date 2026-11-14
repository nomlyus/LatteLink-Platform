import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { LoyaltyBalance, LoyaltyLedgerEntry } from "./data";
import { AccountGlassCard } from "./AccountGlassCard";
import { RewardActivityRow } from "./RewardActivityRow";
import { Button, uiPalette } from "../ui/system";

export function RewardsOverview({ enabled, balance, entries, balanceState, activityState, onRetry }: {
  enabled: boolean; balance?: LoyaltyBalance; entries: LoyaltyLedgerEntry[];
  balanceState: "loading" | "error" | "ready"; activityState: "loading" | "error" | "ready"; onRetry: () => void;
}) {
  const unavailable = !enabled || balanceState === "error";
  return <View style={styles.content}>
    <AccountGlassCard>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.secondary}>Available points</Text>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.balance}>{unavailable ? "Unavailable" : balanceState === "loading" ? "…" : balance?.availablePoints.toLocaleString() ?? "—"}</Text>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.body}>{!enabled ? "Rewards aren’t available at this location right now." : balanceState === "error" ? "We couldn’t load your balance. Please try again." : "Ready for your next visit."}</Text>
      {enabled && balanceState === "ready" && balance ? <View style={styles.metadata}>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.secondary}>Pending {balance.pendingPoints.toLocaleString()} pts</Text>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.secondary}>Lifetime {balance.lifetimeEarned.toLocaleString()} pts</Text>
      </View> : null}
    </AccountGlassCard>
    {enabled ? <AccountGlassCard>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} accessibilityRole="header" style={styles.heading}>Activity</Text>
      {activityState === "loading" ? <ActivityIndicator accessibilityLabel="Loading rewards activity" color={uiPalette.textSecondary} style={styles.loading} />
        : activityState === "error" ? <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.body}>Your activity is temporarily unavailable.</Text>
        : entries.length ? entries.map((entry, index) => <RewardActivityRow key={entry.id} entry={entry} showDivider={index < entries.length - 1} />)
          : <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.body}>Points from your visits will appear here.</Text>}
    </AccountGlassCard> : null}
    {enabled && (balanceState === "error" || activityState === "error") ? <Button label="Retry rewards" variant="secondary" onPress={onRetry} /> : null}
  </View>;
}
const styles = StyleSheet.create({
  content: { gap: 14, marginTop: 14 }, balance: { color: uiPalette.text, fontSize: 36, lineHeight: 42, fontWeight: "700", marginTop: 8 },
  secondary: { color: uiPalette.textSecondary, fontSize: 14, lineHeight: 20 }, body: { color: uiPalette.textSecondary, fontSize: 16, lineHeight: 23, marginTop: 10 },
  heading: { color: uiPalette.text, fontSize: 19, lineHeight: 25, fontWeight: "600" }, metadata: { marginTop: 18, gap: 6 }, loading: { marginVertical: 24 }
});
