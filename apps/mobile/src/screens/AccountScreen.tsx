import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getLoyaltyQueryErrorMessage, useLoyaltyBalanceQuery, useLoyaltyLedgerQuery } from "../account/data";
import { AccountFloatingHeader, ACCOUNT_HEADER_HEIGHT } from "../account/AccountFloatingHeader";
import { apiClient } from "../api/client";
import { customerProfileQueryKey } from "../auth/profile";
import { getAccountRecoveryCopy } from "../auth/recovery";
import { useAuthSession } from "../auth/session";
import { isMobileLoyaltyVisible, resolveAppConfigData, useAppConfigQuery } from "../menu/catalog";
import { TAB_BAR_HEIGHT, getTabBarBottomOffset } from "../navigation/tabBarMetrics";
import { ScreenScroll, ScreenStatic, SectionLabel, uiPalette, uiTypography } from "../ui/system";
import { AccountGlassCard } from "../account/AccountGlassCard";
import { AccountPageRow } from "../account/AccountPrimitives";
import { AccountAppleSignIn } from "../account/AccountAppleSignIn";
import { useAccountSignInCompletion } from "../account/useAccountSignInCompletion";
import { useAppleSignIn } from "../auth/useAppleSignIn";
import { useTabContentLayout } from "../navigation/tabContentLayout";
import type { ReturnToPath } from "../auth/presentation";

type AccountIdentity = Awaited<ReturnType<typeof apiClient.me>> & {
  name?: string;
  displayName?: string;
};

export function AccountScreen({
  onBack,
  presentation = "screen",
  returnTo = "/(tabs)/account",
  onSignInComplete
}: { onBack?: () => void; presentation?: "screen" | "sheet"; returnTo?: ReturnToPath; onSignInComplete?: () => void } = {}) {
  const isSheet = presentation === "sheet";
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabLayout = useTabContentLayout();
  const { isAuthenticated, authRecoveryState } = useAuthSession();
  const appConfigQuery = useAppConfigQuery();
  const appConfig = resolveAppConfigData(appConfigQuery.data);
  const loyaltyEnabled = isMobileLoyaltyVisible(appConfigQuery.data);
  const identityQuery = useQuery({
    queryKey: customerProfileQueryKey,
    enabled: isAuthenticated,
    queryFn: async (): Promise<AccountIdentity> => apiClient.me()
  });
  const appleSignIn = useAppleSignIn();
  useAccountSignInCompletion({
    didSignIn: appleSignIn.didSignIn,
    profile: identityQuery.data,
    isPending: identityQuery.isPending,
    isSuccess: identityQuery.isSuccess,
    isError: identityQuery.isError,
    returnTo,
    onComplete: onSignInComplete
  });
  const loyaltyBalanceQuery = useLoyaltyBalanceQuery(isAuthenticated && loyaltyEnabled);
  const loyaltyLedgerQuery = useLoyaltyLedgerQuery(isAuthenticated && loyaltyEnabled);

  const loyaltyBalance = loyaltyBalanceQuery.data;
  const loyaltyError = loyaltyBalanceQuery.error ?? loyaltyLedgerQuery.error;
  const identity = identityQuery.data;
  const accountGreeting = identity?.name?.trim() || identity?.displayName?.trim() || "Welcome back";
  const headerOffset = isSheet ? 20 : insets.top + ACCOUNT_HEADER_HEIGHT;
  const contentBottomInset = isSheet
    ? 24
    : tabLayout?.contentBottomInset ??
      Math.max(getTabBarBottomOffset(insets.bottom > 0) + TAB_BAR_HEIGHT + 24 - insets.bottom, 24);
  const staticBottomInset = isSheet
    ? Platform.OS === "ios" && Number.parseInt(String(Platform.Version), 10) >= 26
      ? 20
      : Math.max(insets.bottom, 12)
    : tabLayout?.contentBottomInset ?? getTabBarBottomOffset(insets.bottom > 0) + TAB_BAR_HEIGHT + 12;
  const brandName = appConfig?.brand.brandName ?? "";
  const headerBackgroundColor = isSheet ? "transparent" : appConfig?.header.background ?? uiPalette.background;
  const headerForegroundColor = isSheet ? uiPalette.text : appConfig?.header.foreground ?? uiPalette.text;
  const recoveryCopy = getAccountRecoveryCopy(authRecoveryState, brandName);

  function openAccountRoute(pathname: "/(tabs)/account/details/rewards" | "/(tabs)/account/details/profile" | "/(tabs)/account/details/settings") {
    if (!isAuthenticated) {
      router.push({ pathname: "/auth", params: { returnTo: "/(tabs)/account" } });
      return;
    }

    router.push(pathname);
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.screenShell}>
        <ScreenStatic
          transparent={isSheet}
          style={[styles.loggedOutStaticPage, { paddingTop: headerOffset, paddingBottom: staticBottomInset }]}
        >
          <View style={styles.loggedOutStaticBody}>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.loggedOutStaticTitle}>
              {recoveryCopy.title}
            </Text>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.loggedOutStaticText}>
              {recoveryCopy.body}
            </Text>
          </View>

          <AccountAppleSignIn
            signIn={appleSignIn}
            onAlternativeSignIn={() => router.push({ pathname: "/auth", params: { returnTo } })}
          />
        </ScreenStatic>

        {isSheet ? null : (
          <AccountFloatingHeader
            title="Account"
            onBack={onBack}
            insetTop={insets.top}
            backgroundColor={headerBackgroundColor}
            foregroundColor={headerForegroundColor}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.screenShell}>
      <ScreenScroll
        transparent={isSheet}
        bottomInset={contentBottomInset}
        contentContainerStyle={[styles.screenContentNoTopPadding, { paddingTop: headerOffset }]}
      >
        <AccountGlassCard style={styles.summaryCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              <SectionLabel label="Account" />
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.heroTitle}>
                {accountGreeting}
              </Text>
            </View>
          </View>

          <View style={styles.pointsWrap}>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.pointsLabel}>
              Available points
            </Text>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.pointsValue}>
              {loyaltyEnabled
                ? loyaltyBalance
                  ? `${loyaltyBalance.availablePoints}`
                  : loyaltyError
                    ? "--"
                    : "…"
                : "Off"}
            </Text>
            <View style={styles.pointsMetaRow}>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.pointsMeta}>
                {loyaltyEnabled
                  ? `Lifetime ${loyaltyBalance ? loyaltyBalance.lifetimeEarned : "--"} pts`
                  : "Loyalty unavailable"}
              </Text>
            </View>
            {loyaltyEnabled && loyaltyError ? (
              <View style={styles.pointsErrorWrap}>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.pointsError}>
                  {getLoyaltyQueryErrorMessage(loyaltyError)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry rewards"
                  onPress={() => {
                    void Promise.allSettled([loyaltyBalanceQuery.refetch(), loyaltyLedgerQuery.refetch()]);
                  }}
                  style={({ pressed }) => [styles.pointsRetry, pressed ? styles.pointsRetryPressed : null]}
                >
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.pointsRetryLabel}>
                    Retry rewards
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </AccountGlassCard>

        <View style={styles.listSection}>
          <AccountGlassCard contentStyle={styles.pageListContent}>
            <AccountPageRow label="Rewards activity" icon="gift" onPress={() => openAccountRoute("/(tabs)/account/details/rewards")} />
            <AccountPageRow label="Profile" icon="person" onPress={() => openAccountRoute("/(tabs)/account/details/profile")} />
            <AccountPageRow label="Settings" icon="settings" isLast onPress={() => openAccountRoute("/(tabs)/account/details/settings")} />
          </AccountGlassCard>
        </View>
      </ScreenScroll>

      {isSheet ? null : (
        <AccountFloatingHeader
          title="Account"
          onBack={onBack}
          insetTop={insets.top}
          backgroundColor={headerBackgroundColor}
          foregroundColor={headerForegroundColor}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenShell: {
    flex: 1
  },
  summaryCard: {
    marginTop: 18
  },
  screenContentNoTopPadding: {
    paddingTop: 0
  },
  loggedOutStaticPage: {
    flex: 1,
    justifyContent: "space-between"
  },
  loggedOutStaticBody: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: 18,
    paddingBottom: 32
  },
  loggedOutStaticTitle: {
    marginTop: 12,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -1.1,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "700"
  },
  loggedOutStaticText: {
    marginTop: 12,
    maxWidth: 320,
    fontSize: 16,
    lineHeight: 24,
    color: uiPalette.textSecondary
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16
  },
  heroCopy: {
    flex: 1
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
  pointsWrap: {
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: uiPalette.border
  },
  pointsLabel: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: uiPalette.textMuted,
    fontWeight: "700"
  },
  pointsValue: {
    marginTop: 10,
    fontSize: 46,
    lineHeight: 50,
    letterSpacing: -1.6,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "700"
  },
  pointsMetaRow: {
    marginTop: 10,
    gap: 4
  },
  pointsMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: uiPalette.textSecondary
  },
  pointsErrorWrap: {
    marginTop: 14,
    gap: 10
  },
  pointsError: {
    color: uiPalette.warning,
    fontSize: 13,
    lineHeight: 19
  },
  pointsRetry: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: uiPalette.border,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  pointsRetryPressed: {
    opacity: 0.72
  },
  pointsRetryLabel: {
    color: uiPalette.text,
    fontSize: 13,
    fontWeight: "700"
  },
  listSection: {
    marginTop: 24
  },
  pageListContent: {
    padding: 0
  }
});
