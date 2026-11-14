import { tabDestinations } from "../../src/navigation/destinations";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DeleteAccountSheet } from "../../src/account/DeleteAccountSheet";
import { AccountFloatingHeader, ACCOUNT_HEADER_HEIGHT } from "../../src/account/AccountFloatingHeader";
import { getSettingsRecoveryCopy } from "../../src/auth/recovery";
import { useAuthSession } from "../../src/auth/session";
import { useCart } from "../../src/cart/store";
import { resolvePrivacyPolicyUrl } from "../../src/legal/links";
import { isMobileLoyaltyVisible, resolveAppConfigData, useAppConfigQuery } from "../../src/menu/catalog";
import { Button, ScreenScroll, SectionLabel, uiPalette, uiTypography } from "../../src/ui/system";
import { AccountGlassCard } from "../../src/account/AccountGlassCard";
import { SettingsInfoRow, SettingsActionRow } from "../../src/account/SettingsRows";

export default function SettingsPage({ presentation = "screen", contentTopInset = 0 }: { presentation?: "screen" | "sheet"; contentTopInset?: number } = {}) {
  const isSheet = presentation === "sheet";
  const router = useRouter();
  const safeInsets = useSafeAreaInsets();
  const insets = { ...safeInsets, top: isSheet ? 16 : safeInsets.top };
  const { isAuthenticated, signOut, deleteAccount, authRecoveryState } = useAuthSession();
  const { clear } = useCart();
  const appConfigQuery = useAppConfigQuery();
  const appConfig = resolveAppConfigData(appConfigQuery.data);
  const loyaltyEnabled = isMobileLoyaltyVisible(appConfigQuery.data);
  const pushEnabled = appConfig?.featureFlags.pushNotifications ?? false;
  const privacyPolicyUrl = resolvePrivacyPolicyUrl();
  const headerOffset = isSheet ? contentTopInset + 16 : insets.top + ACCOUNT_HEADER_HEIGHT;
  const headerBackgroundColor = isSheet ? "transparent" : appConfig?.header.background ?? uiPalette.background;
  const headerForegroundColor = isSheet ? uiPalette.text : appConfig?.header.foreground ?? uiPalette.text;
  const locationName = appConfig?.brand.locationName ?? "Location unavailable";
  const [signOutPending, setSignOutPending] = useState(false);
  const [deleteAccountPending, setDeleteAccountPending] = useState(false);
  const [deleteAccountSheetOpen, setDeleteAccountSheetOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const recoveryCopy = getSettingsRecoveryCopy(authRecoveryState);

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/(tabs)/account");
  }

  async function handleSignOut() {
    setActionError(null);
    setSignOutPending(true);
    try {
      await signOut();
      clear();
      router.dismissTo(tabDestinations.home);
    } catch {
      setActionError("We couldn’t sign you out. Please try again.");
    } finally {
      setSignOutPending(false);
    }
  }

  async function handleDeleteAccount() {
    setActionError(null);
    setDeleteAccountPending(true);
    try {
      await deleteAccount();
      clear();
      setDeleteAccountSheetOpen(false);
      router.dismissTo(tabDestinations.home);
    } catch {
      setActionError("We couldn't delete this account right now. Try again in a moment.");
      setDeleteAccountSheetOpen(false);
    } finally {
      setDeleteAccountPending(false);
    }
  }

  async function handleOpenPrivacyPolicy() {
    setActionError(null);

    if (!privacyPolicyUrl) {
      setActionError("This build is missing its privacy policy link.");
      return;
    }

    try {
      await Linking.openURL(privacyPolicyUrl);
    } catch {
      setActionError("We couldn't open the privacy policy right now. Try again in a moment.");
    }
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.screenShell}>
        <ScreenScroll
          transparent={isSheet}
          contentInsetAdjustmentBehavior={isSheet ? "never" : undefined}
          bottomInset={48}
          contentContainerStyle={[styles.screenContentNoTopPadding, { paddingTop: headerOffset }]}
        >
          <AccountGlassCard style={styles.heroCard}>
            <SectionLabel label="Settings" />
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.heroTitle}>
              {recoveryCopy.title}
            </Text>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.heroBody}>
              {recoveryCopy.body}
            </Text>
            <Button
              label={recoveryCopy.actionLabel}
              variant="secondary"
              onPress={() => router.push({ pathname: "/auth", params: { returnTo: "/account/settings" } })}
              style={styles.heroAction}
            />
          </AccountGlassCard>

          {actionError ? (
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionError}>
              {actionError}
            </Text>
          ) : null}

          <View style={styles.settingsSection}>
            <AccountGlassCard contentStyle={styles.groupContent}>
              <SettingsActionRow
                label="Privacy Policy"
                icon="shield-checkmark"
                onPress={() => {
                  void handleOpenPrivacyPolicy();
                }}
                disabled={!privacyPolicyUrl}
                isLast
              />
            </AccountGlassCard>
          </View>
        </ScreenScroll>

        {isSheet ? null : <AccountFloatingHeader
          title="Settings"
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
        transparent={isSheet}
        contentInsetAdjustmentBehavior={isSheet ? "never" : undefined}
        bottomInset={48}
        contentContainerStyle={[styles.screenContentNoTopPadding, { paddingTop: headerOffset }]}
      >
        {actionError ? (
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionError}>
            {actionError}
          </Text>
        ) : null}

        <View style={styles.settingsSection}>
          <AccountGlassCard contentStyle={styles.groupContent}>
            <SettingsInfoRow label="Location" icon="location" value={locationName} />
            <SettingsInfoRow label="Alerts" icon="notifications" value={pushEnabled ? "Enabled" : "Disabled"} />
            <SettingsInfoRow label="Loyalty" icon="gift" value={loyaltyEnabled ? "Enabled" : "Disabled"} isLast />
          </AccountGlassCard>
        </View>

        <View style={styles.settingsSection}>
          <AccountGlassCard contentStyle={styles.groupContent}>
            <SettingsActionRow
              label="Privacy Policy"
              icon="shield-checkmark"
              onPress={() => {
                void handleOpenPrivacyPolicy();
              }}
              disabled={!privacyPolicyUrl}
              isLast
            />
          </AccountGlassCard>
        </View>

        <View style={styles.settingsSection}>
          <AccountGlassCard contentStyle={styles.groupContent}>
            <SettingsActionRow
              icon="trash"
              label={deleteAccountPending ? "Deleting Account…" : "Delete Account"}
              onPress={() => {
                setDeleteAccountSheetOpen(true);
              }}
              disabled={deleteAccountPending || signOutPending}
              tone="danger"
            />
            <SettingsActionRow
              icon="log-out"
              disclosure={false}
              label={signOutPending ? "Signing Out…" : "Sign Out"}
              onPress={() => {
                void handleSignOut();
              }}
              disabled={signOutPending || deleteAccountPending}
              isLast
            />
          </AccountGlassCard>
        </View>
      </ScreenScroll>

      {isSheet ? null : <AccountFloatingHeader
        title="Settings"
        insetTop={insets.top}
        onBack={goBack}
        backgroundColor={headerBackgroundColor}
        foregroundColor={headerForegroundColor}
      />}
      <DeleteAccountSheet
        open={deleteAccountSheetOpen}
        bottomInset={insets.bottom}
        pending={deleteAccountPending}
        onClose={() => setDeleteAccountSheetOpen(false)}
        onCancel={() => setDeleteAccountSheetOpen(false)}
        onConfirm={() => {
          void handleDeleteAccount();
        }}
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
  settingsSection: {
    marginTop: 14
  },
  sectionError: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: uiPalette.danger
  },
  groupContent: {
    padding: 0
  }
});
