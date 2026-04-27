import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthSession } from "../../src/auth/session";
import { useLoyaltyBalanceQuery, useLoyaltyLedgerQuery, type LoyaltyLedgerEntry } from "../../src/account/data";
import { AccountFloatingHeader, ACCOUNT_HEADER_HEIGHT } from "../../src/account/AccountFloatingHeader";
import { isMobileLoyaltyVisible, resolveAppConfigData, useAppConfigQuery } from "../../src/menu/catalog";
import { Button, Card, Chip, GlassCard, ScreenScroll, SectionLabel, uiPalette, uiTypography } from "../../src/ui/system";

function formatDateTime(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}

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

function ActivityRow({
  entry,
  showDivider
}: {
  entry: LoyaltyLedgerEntry;
  showDivider: boolean;
}) {
  return (
    <View style={[styles.activityRow, showDivider ? styles.activityRowDivider : null]}>
      <View style={styles.activityLeft}>
        <Chip label={formatLedgerType(entry.type)} active={entry.points >= 0} />
        {entry.orderId ? <Text style={styles.activityOrder}>{`Order ${entry.orderId.slice(0, 8).toUpperCase()}`}</Text> : null}
      </View>

      <View style={styles.activityRight}>
        <Text style={[styles.activityPoints, entry.points < 0 ? styles.activityPointsNegative : null]}>{formatLedgerPoints(entry.points)}</Text>
        <Text style={styles.activityMeta}>{formatDateTime(entry.createdAt)}</Text>
      </View>
    </View>
  );
}

export default function RewardsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuthSession();
  const appConfigQuery = useAppConfigQuery();
  const appConfig = resolveAppConfigData(appConfigQuery.data);
  const loyaltyEnabled = isMobileLoyaltyVisible(appConfigQuery.data);
  const loyaltyBalanceQuery = useLoyaltyBalanceQuery(isAuthenticated && loyaltyEnabled);
  const loyaltyLedgerQuery = useLoyaltyLedgerQuery(isAuthenticated && loyaltyEnabled);
  const headerOffset = insets.top + ACCOUNT_HEADER_HEIGHT;
  const loyaltyBalance = loyaltyBalanceQuery.data;
  const loyaltyLedger = loyaltyLedgerQuery.data ?? [];

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/(tabs)/account");
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.screenShell}>
        <ScreenScroll bottomInset={48} contentContainerStyle={[styles.screenContentNoTopPadding, { paddingTop: headerOffset }]}>
          <GlassCard style={styles.heroCard}>
            <SectionLabel label="Rewards" />
            <Text style={styles.heroTitle}>Sign in to view rewards.</Text>
            <Text style={styles.heroBody}>Rewards activity and balances are attached to your account.</Text>
            <Button
              label="Sign In"
              variant="secondary"
              onPress={() => router.push({ pathname: "/auth", params: { returnTo: "/account/rewards" } })}
              style={styles.heroAction}
            />
          </GlassCard>
        </ScreenScroll>

        <AccountFloatingHeader title="Rewards" insetTop={insets.top} onBack={goBack} backgroundColor={appConfig.header.background} foregroundColor={appConfig.header.foreground} />
      </View>
    );
  }

  return (
    <View style={styles.screenShell}>
      <ScreenScroll bottomInset={48} contentContainerStyle={[styles.screenContentNoTopPadding, { paddingTop: headerOffset }]}>
        <GlassCard style={styles.heroCard}>
          <SectionLabel label="Balance" />
          <Text style={styles.heroTitle}>{loyaltyEnabled ? (loyaltyBalance ? `${loyaltyBalance.availablePoints} pts` : "Loading") : "Off"}</Text>
          <Text style={styles.heroBody}>{loyaltyEnabled ? "Available points ready for future visits." : "Loyalty is disabled for this client."}</Text>
          {loyaltyEnabled ? (
            <View style={styles.balanceMetaWrap}>
              <Text style={styles.balanceMeta}>{`Pending ${loyaltyBalance ? loyaltyBalance.pendingPoints : "--"} pts`}</Text>
              <Text style={styles.balanceMeta}>{`Lifetime ${loyaltyBalance ? loyaltyBalance.lifetimeEarned : "--"} pts`}</Text>
            </View>
          ) : null}
        </GlassCard>

        <Card style={styles.sectionCard}>
          <SectionLabel label="Activity" />
          {!loyaltyEnabled ? (
            <Text style={styles.bodyText}>Loyalty is disabled for this client.</Text>
          ) : loyaltyLedger.length === 0 ? (
            <Text style={styles.bodyText}>Your next paid order will show up here once points post.</Text>
          ) : (
            <View style={styles.activityList}>
              {loyaltyLedger.map((entry, index) => (
                <ActivityRow key={entry.id} entry={entry} showDivider={index < loyaltyLedger.length - 1} />
              ))}
            </View>
          )}
        </Card>
      </ScreenScroll>

      <AccountFloatingHeader title="Rewards" insetTop={insets.top} onBack={goBack} backgroundColor={appConfig.header.background} foregroundColor={appConfig.header.foreground} />
    </View>
  );
}

const styles = StyleSheet.create({
  screenShell: {
    flex: 1
  },
  screenContentNoTopPadding: {
    paddingTop: 0
  },
  heroCard: {
    marginTop: 18
  },
  heroTitle: {
    marginTop: 10,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.8,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "700"
  },
  heroBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: uiPalette.textSecondary
  },
  heroAction: {
    marginTop: 18,
    alignSelf: "flex-start"
  },
  balanceMetaWrap: {
    marginTop: 18,
    gap: 6
  },
  balanceMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: uiPalette.textSecondary
  },
  sectionCard: {
    marginTop: 14
  },
  bodyText: {
    marginTop: 14,
    fontSize: 14,
    lineHeight: 22,
    color: uiPalette.textSecondary
  },
  activityList: {
    marginTop: 14
  },
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
