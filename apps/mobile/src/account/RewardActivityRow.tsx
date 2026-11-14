import { StyleSheet, Text, View } from "react-native";
import { type LoyaltyLedgerEntry } from "./data";
import { uiPalette, uiTypography } from "../ui/system";
import { formatDateTime } from "./presentation";

function formatLedgerType(type: LoyaltyLedgerEntry["type"]) {
  switch (type) {
    case "EARN":
      return "Earned";
    case "REDEEM":
      return "Redeemed";
    case "REFUND":
      return "Returned";
    case "ADJUSTMENT":
    default:
      return "Adjusted";
  }
}

function formatLedgerPoints(points: number) {
  return `${points > 0 ? "+" : ""}${points} pts`;
}

export function RewardActivityRow({ entry, showDivider }: { entry: LoyaltyLedgerEntry; showDivider: boolean }) {
  return (
    <View style={[styles.activityRow, showDivider ? styles.activityRowDivider : null]}>
      <View style={styles.activityLeft}>
        <View style={styles.activityType}>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.activityTypeLabel}>
            {formatLedgerType(entry.type)}
          </Text>
        </View>
        {entry.orderId ? (
          <Text
            allowFontScaling={false}
            maxFontSizeMultiplier={1}
            style={styles.activityOrder}
          >{`Order ${entry.orderId.slice(0, 8).toUpperCase()}`}</Text>
        ) : null}
      </View>

      <View style={styles.activityRight}>
        <Text
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          style={[styles.activityPoints, entry.points < 0 ? styles.activityPointsNegative : null]}
        >
          {formatLedgerPoints(entry.points)}
        </Text>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.activityMeta}>
          {formatDateTime(entry.createdAt)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  activityRow: {
    minHeight: 72,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  activityRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border
  },
  activityLeft: {
    flex: 1,
    gap: 8
  },
  activityType: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: uiPalette.accentSoft
  },
  activityTypeLabel: {
    color: uiPalette.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    fontFamily: uiTypography.bodyFamily
  },
  activityOrder: {
    fontSize: 12,
    lineHeight: 18,
    color: uiPalette.textSecondary
  },
  activityRight: {
    alignItems: "flex-end",
    gap: 4
  },
  activityPoints: {
    fontSize: 14,
    lineHeight: 18,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  },
  activityPointsNegative: {
    color: uiPalette.danger
  },
  activityMeta: {
    fontSize: 12,
    lineHeight: 18,
    color: uiPalette.textSecondary
  }
});
