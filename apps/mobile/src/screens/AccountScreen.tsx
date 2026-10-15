import { useRefresh } from "../ui/useRefresh";
import * as Sentry from "@sentry/react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getLoyaltyQueryErrorMessage, useLoyaltyBalanceQuery, useLoyaltyLedgerQuery } from "../account/data";
import { AccountFloatingHeader, ACCOUNT_HEADER_HEIGHT } from "../account/AccountFloatingHeader";
import { MOBILE_API_ENVIRONMENT, apiClient } from "../api/client";
import { customerProfileQueryKey } from "../auth/profile";
import { getAccountRecoveryCopy } from "../auth/recovery";
import { useAuthSession } from "../auth/session";
import { useLocationContext } from "../location/LocationProvider";
import { isMobileLoyaltyVisible, resolveAppConfigData, useAppConfigQuery } from "../menu/catalog";
import { TAB_BAR_HEIGHT, getTabBarBottomOffset } from "../navigation/tabBarMetrics";
import { Chip, GlassCard, ScreenScroll, ScreenStatic, SectionLabel, uiPalette, uiTypography } from "../ui/system";
import { AccountPageRow, GuestSignInPill } from "../account/AccountPrimitives";

type AccountIdentity = Awaited<ReturnType<typeof apiClient.me>> & {
  name?: string;
  displayName?: string;
};

export function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, authRecoveryState } = useAuthSession();
  const location = useLocationContext();
  const appConfigQuery = useAppConfigQuery();
  const appConfig = resolveAppConfigData(appConfigQuery.data);
  const loyaltyEnabled = isMobileLoyaltyVisible(appConfigQuery.data);
  const identityQuery = useQuery({
    queryKey: customerProfileQueryKey,
    enabled: isAuthenticated,
    queryFn: async (): Promise<AccountIdentity> => apiClient.me()
  });
  const loyaltyBalanceQuery = useLoyaltyBalanceQuery(isAuthenticated && loyaltyEnabled);
  const loyaltyLedgerQuery = useLoyaltyLedgerQuery(isAuthenticated && loyaltyEnabled);
  const { refreshing: isManualRefresh, refresh: handleRefresh } = useRefresh([
    appConfigQuery.refetch,
    identityQuery.refetch,
    loyaltyBalanceQuery.refetch,
    loyaltyLedgerQuery.refetch
  ]);
  const [sentryDiagnosticState, setSentryDiagnosticState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  const loyaltyBalance = loyaltyBalanceQuery.data;
  const loyaltyError = loyaltyBalanceQuery.error ?? loyaltyLedgerQuery.error;
  const identity = identityQuery.data;
  const accountGreeting = identity?.name?.trim() || identity?.displayName?.trim() || "Welcome back";
  const headerOffset = insets.top + ACCOUNT_HEADER_HEIGHT;
  const contentBottomInset = Math.max(
    getTabBarBottomOffset(insets.bottom > 0) + TAB_BAR_HEIGHT + 24 - insets.bottom,
    24
  );
  const staticBottomInset = getTabBarBottomOffset(insets.bottom > 0) + TAB_BAR_HEIGHT + 12;
  const locationName = appConfig?.brand.locationName ?? "this store";
  const headerBackgroundColor = appConfig?.header.background ?? uiPalette.background;
  const headerForegroundColor = appConfig?.header.foreground ?? uiPalette.text;
  const recoveryCopy = getAccountRecoveryCopy(authRecoveryState, locationName);

  function openAccountRoute(pathname: "/account/rewards" | "/account/alerts" | "/account/settings") {
    if (!isAuthenticated) {
      router.push({ pathname: "/auth", params: { returnTo: "/(tabs)/account" } });
      return;
    }

    router.push(pathname);
  }

  function sendSentryDiagnosticEvent() {
    if (sentryDiagnosticState === "sending") return;

    setSentryDiagnosticState("sending");
    Sentry.withScope((scope) => {
      scope.setTag("diagnostic", "mobile-sentry-validation");
      scope.setTag("app_variant", MOBILE_API_ENVIRONMENT.variant ?? "unknown");
      scope.setContext("mobile_environment", {
        apiBaseUrl: MOBILE_API_ENVIRONMENT.apiBaseUrl,
        bundleIdentifier: MOBILE_API_ENVIRONMENT.bundleIdentifier,
        locationId: location.selectedLocationId
      });
      Sentry.captureException(new Error("Mobile app Sentry diagnostic event"));
    });

    void Sentry.flush().then(
      () => setSentryDiagnosticState("sent"),
      () => setSentryDiagnosticState("failed")
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.screenShell}>
        <ScreenStatic
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

          <GuestSignInPill
            label={recoveryCopy.actionLabel}
            onPress={() => router.push({ pathname: "/auth", params: { returnTo: "/(tabs)/account" } })}
          />
        </ScreenStatic>

        <AccountFloatingHeader
          title="Account"
          insetTop={insets.top}
          backgroundColor={headerBackgroundColor}
          foregroundColor={headerForegroundColor}
        />
      </View>
    );
  }

  return (
    <View style={styles.screenShell}>
      <ScreenScroll
        bottomInset={contentBottomInset}
        refreshing={isAuthenticated && isManualRefresh}
        onRefresh={isAuthenticated ? handleRefresh : undefined}
        contentContainerStyle={[styles.screenContentNoTopPadding, { paddingTop: headerOffset }]}
      >
        <GlassCard style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              <SectionLabel label="Account" />
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.heroTitle}>
                {accountGreeting}
              </Text>
            </View>
            <Chip label={loyaltyEnabled ? "Loyalty On" : "Loyalty Off"} active={loyaltyEnabled} />
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
        </GlassCard>

        <View style={styles.listSection}>
          <View style={styles.pageList}>
            <AccountPageRow label="Rewards activity" onPress={() => openAccountRoute("/account/rewards")} />
            <AccountPageRow label="Profile" onPress={() => openAccountRoute("/account/alerts")} />
            <AccountPageRow label="Settings" isLast onPress={() => openAccountRoute("/account/settings")} />
          </View>
          {MOBILE_API_ENVIRONMENT.variant === "beta" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send Sentry diagnostic"
              onPress={sendSentryDiagnosticEvent}
              disabled={sentryDiagnosticState === "sending"}
              style={({ pressed }) => [
                styles.diagnosticButton,
                pressed && sentryDiagnosticState !== "sending" ? styles.diagnosticButtonPressed : null
              ]}
            >
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.diagnosticLabel}>
                {sentryDiagnosticState === "sending"
                  ? "Sending Sentry diagnostic…"
                  : sentryDiagnosticState === "sent"
                    ? "Sentry diagnostic sent"
                    : sentryDiagnosticState === "failed"
                      ? "Sentry diagnostic failed"
                      : "Send Sentry diagnostic"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </ScreenScroll>

      <AccountFloatingHeader
        title="Account"
        insetTop={insets.top}
        backgroundColor={headerBackgroundColor}
        foregroundColor={headerForegroundColor}
      />
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
    marginTop: 28
  },
  pageList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: uiPalette.border,
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border
  },
  diagnosticButton: {
    alignSelf: "flex-start",
    marginTop: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: uiPalette.border,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  diagnosticButtonPressed: {
    opacity: 0.72
  },
  diagnosticLabel: {
    color: uiPalette.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase"
  }
});
