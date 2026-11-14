import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthSession } from "../../src/auth/session";
import { useLoyaltyBalanceQuery, useLoyaltyLedgerQuery } from "../../src/account/data";
import { AccountFloatingHeader, ACCOUNT_HEADER_HEIGHT } from "../../src/account/AccountFloatingHeader";
import { isMobileLoyaltyVisible, resolveAppConfigData, useAppConfigQuery } from "../../src/menu/catalog";
import { Button, ScreenScroll, SectionLabel, uiPalette, uiTypography } from "../../src/ui/system";
import { AccountGlassCard } from "../../src/account/AccountGlassCard";
import { RewardsOverview } from "../../src/account/RewardsOverview";
import { useNativeScrollEdge } from "../../src/navigation/useNativeScrollEdge";
import { nativeAppleHeaderCapabilities } from "../../src/navigation/nativeAppleHeader";
import { tabDestinations } from "../../src/navigation/destinations";

export default function RewardsPage({ presentation = "screen", contentTopInset = 0 }: { presentation?: "screen" | "sheet" | "tab"; contentTopInset?: number } = {}) {
  const isSheet = presentation === "sheet";
  const isTab = presentation === "tab";
  const nativeHeader = isSheet || isTab;
  const registerScrollEdge = useNativeScrollEdge(isTab && nativeAppleHeaderCapabilities().available);
  const router = useRouter();
  const safeInsets = useSafeAreaInsets();
  const insets = { ...safeInsets, top: isSheet ? 16 : safeInsets.top };
  const { isAuthenticated } = useAuthSession();
  const appConfigQuery = useAppConfigQuery();
  const appConfig = resolveAppConfigData(appConfigQuery.data);
  const loyaltyEnabled = isMobileLoyaltyVisible(appConfigQuery.data);
  const headerBackgroundColor = isSheet ? "transparent" : appConfig?.header.background ?? uiPalette.background;
  const headerForegroundColor = isSheet ? uiPalette.text : appConfig?.header.foreground ?? uiPalette.text;
  const loyaltyBalanceQuery = useLoyaltyBalanceQuery(isAuthenticated && loyaltyEnabled);
  const loyaltyLedgerQuery = useLoyaltyLedgerQuery(isAuthenticated && loyaltyEnabled);
  const headerOffset = nativeHeader ? contentTopInset + 16 : insets.top + ACCOUNT_HEADER_HEIGHT;
  const loyaltyBalance = loyaltyBalanceQuery.isError ? undefined : loyaltyBalanceQuery.data;
  const loyaltyLedger = loyaltyLedgerQuery.isError ? [] : loyaltyLedgerQuery.data ?? [];

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
        <ScreenScroll
          onLayout={isTab ? registerScrollEdge : undefined}
          transparent={nativeHeader}
          contentInsetAdjustmentBehavior={nativeHeader ? "never" : undefined}
          bottomInset={48}
          contentContainerStyle={[styles.screenContentNoTopPadding, { paddingTop: headerOffset }]}
        >
          <AccountGlassCard style={styles.heroCard}>
            <SectionLabel label="Rewards" />
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.heroTitle}>
              Sign in to view rewards.
            </Text>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.heroBody}>
              Rewards activity and balances are attached to your account.
            </Text>
            <Button
              label="Sign In"
              variant="secondary"
              onPress={() => router.push({ pathname: "/auth", params: { returnTo: isTab ? tabDestinations.rewards : "/account/rewards" } })}
              style={styles.heroAction}
            />
          </AccountGlassCard>
        </ScreenScroll>

        {nativeHeader ? null : <AccountFloatingHeader
          title="Rewards"
          insetTop={insets.top}
          onBack={goBack}
          backgroundColor={headerBackgroundColor}
          foregroundColor={headerForegroundColor}
        />}
      </View>
    );
  }

  return (
    <View style={styles.screenShell}>
      <ScreenScroll
        onLayout={isTab ? registerScrollEdge : undefined}
        transparent={nativeHeader}
        contentInsetAdjustmentBehavior={nativeHeader ? "never" : undefined}
        bottomInset={48}
        contentContainerStyle={[styles.screenContentNoTopPadding, { paddingTop: headerOffset }]}
      >
        <RewardsOverview enabled={loyaltyEnabled} balance={loyaltyBalance} entries={loyaltyLedger}
          balanceState={loyaltyBalanceQuery.isError ? "error" : loyaltyBalanceQuery.isLoading ? "loading" : "ready"}
          activityState={loyaltyLedgerQuery.isError ? "error" : loyaltyLedgerQuery.isLoading ? "loading" : "ready"}
          onRetry={() => { void Promise.allSettled([loyaltyBalanceQuery.refetch(), loyaltyLedgerQuery.refetch()]); }} />
      </ScreenScroll>

      {nativeHeader ? null : <AccountFloatingHeader
        title="Rewards"
        insetTop={insets.top}
        onBack={goBack}
        backgroundColor={headerBackgroundColor}
        foregroundColor={headerForegroundColor}
      />}
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
  }
});
