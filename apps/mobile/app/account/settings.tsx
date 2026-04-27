import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DeleteAccountSheet } from "../../src/account/DeleteAccountSheet";
import { AccountFloatingHeader, ACCOUNT_HEADER_HEIGHT } from "../../src/account/AccountFloatingHeader";
import { getSettingsRecoveryCopy } from "../../src/auth/recovery";
import { useAuthSession } from "../../src/auth/session";
import { useCart } from "../../src/cart/store";
import { resolvePrivacyPolicyUrl } from "../../src/legal/links";
import { isMobileLoyaltyVisible, resolveAppConfigData, useAppConfigQuery } from "../../src/menu/catalog";
import { Button, Chip, GlassCard, ScreenScroll, SectionLabel, uiPalette, uiTypography } from "../../src/ui/system";

function SettingsInfoRow({
  label,
  value,
  isLast = false
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionRowInner}>
        <Text style={styles.sectionRowLabel}>{label}</Text>
        <Text style={styles.sectionRowValue}>{value}</Text>
      </View>
      {isLast ? null : <View style={styles.sectionRowDivider} />}
    </View>
  );
}

function SettingsActionRow({
  label,
  onPress,
  disabled = false,
  isLast = false,
  tone = "default"
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  isLast?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.sectionRow, pressed && !disabled ? styles.sectionRowPressed : null]}
    >
      <View style={styles.sectionRowInner}>
        <Text
          style={[
            styles.sectionRowLabel,
            tone === "danger" ? styles.sectionRowLabelDanger : null,
            disabled ? styles.sectionRowLabelDisabled : null
          ]}
        >
          {label}
        </Text>
      </View>
      {isLast ? null : <View style={styles.sectionRowDivider} />}
    </Pressable>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, signOut, deleteAccount, authRecoveryState } = useAuthSession();
  const { clear } = useCart();
  const appConfigQuery = useAppConfigQuery();
  const appConfig = resolveAppConfigData(appConfigQuery.data);
  const loyaltyEnabled = isMobileLoyaltyVisible(appConfigQuery.data);
  const pushEnabled = appConfig.featureFlags.pushNotifications;
  const privacyPolicyUrl = resolvePrivacyPolicyUrl();
  const headerOffset = insets.top + ACCOUNT_HEADER_HEIGHT;
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
      router.dismissTo("/(tabs)/home");
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
      router.dismissTo("/(tabs)/home");
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
        <ScreenScroll bottomInset={48} contentContainerStyle={[styles.screenContentNoTopPadding, { paddingTop: headerOffset }]}>
          <GlassCard style={styles.heroCard}>
            <SectionLabel label="Settings" />
            <Text style={styles.heroTitle}>{recoveryCopy.title}</Text>
            <Text style={styles.heroBody}>{recoveryCopy.body}</Text>
            <Button
              label={recoveryCopy.actionLabel}
              variant="secondary"
              onPress={() => router.push({ pathname: "/auth", params: { returnTo: "/account/settings" } })}
              style={styles.heroAction}
            />
          </GlassCard>

          {actionError ? <Text style={styles.sectionError}>{actionError}</Text> : null}

          <View style={styles.settingsSection}>
            <SectionLabel label="Legal" />
            <View style={styles.sectionList}>
              <SettingsActionRow
                label="Privacy Policy"
                onPress={() => {
                  void handleOpenPrivacyPolicy();
                }}
                disabled={!privacyPolicyUrl}
                isLast
              />
            </View>
          </View>
        </ScreenScroll>

        <AccountFloatingHeader title="Settings" insetTop={insets.top} onBack={goBack} backgroundColor={appConfig.header.background} foregroundColor={appConfig.header.foreground} />
      </View>
    );
  }

  return (
    <View style={styles.screenShell}>
      <ScreenScroll bottomInset={48} contentContainerStyle={[styles.screenContentNoTopPadding, { paddingTop: headerOffset }]}>
        <GlassCard style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              <SectionLabel label="Preferences" />
              <Text style={styles.heroTitle}>Account settings</Text>
              <Text style={styles.heroBody}>Manage the account-level settings tied to this device and store profile.</Text>
            </View>
            <Chip label="Active" active />
          </View>
        </GlassCard>

        {actionError ? <Text style={styles.sectionError}>{actionError}</Text> : null}

        <View style={styles.settingsSection}>
          <SectionLabel label="App" />
          <View style={styles.sectionList}>
            <SettingsInfoRow label="Location" value={appConfig.brand.locationName} />
            <SettingsInfoRow label="Alerts" value={pushEnabled ? "Enabled" : "Disabled"} />
            <SettingsInfoRow label="Loyalty" value={loyaltyEnabled ? "Enabled" : "Disabled"} isLast />
          </View>
        </View>

        <View style={styles.settingsSection}>
          <SectionLabel label="Legal" />
          <View style={styles.sectionList}>
            <SettingsActionRow
              label="Privacy Policy"
              onPress={() => {
                void handleOpenPrivacyPolicy();
              }}
              disabled={!privacyPolicyUrl}
              isLast
            />
          </View>
        </View>

        <View style={styles.settingsSection}>
          <SectionLabel label="Account" />
          <View style={styles.sectionList}>
            <SettingsActionRow
              label={deleteAccountPending ? "Deleting Account…" : "Delete Account"}
              onPress={() => {
                setDeleteAccountSheetOpen(true);
              }}
              disabled={deleteAccountPending || signOutPending}
              tone="danger"
            />
            <SettingsActionRow
              label={signOutPending ? "Signing Out…" : "Sign Out"}
              onPress={() => {
                void handleSignOut();
              }}
              disabled={signOutPending || deleteAccountPending}
              isLast
            />
          </View>
        </View>
      </ScreenScroll>

      <AccountFloatingHeader title="Settings" insetTop={insets.top} onBack={goBack} backgroundColor={appConfig.header.background} foregroundColor={appConfig.header.foreground} />
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
    marginTop: 28
  },
  sectionError: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: uiPalette.danger
  },
  sectionList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: uiPalette.border,
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border
  },
  sectionRow: {
    minHeight: 68
  },
  sectionRowPressed: {
    opacity: 0.72
  },
  sectionRowInner: {
    minHeight: 68,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  sectionRowDivider: {
    marginHorizontal: 12,
    height: 1,
    backgroundColor: uiPalette.border
  },
  sectionRowLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  },
  sectionRowLabelDanger: {
    color: uiPalette.danger
  },
  sectionRowLabelDisabled: {
    color: uiPalette.textMuted
  },
  sectionRowValue: {
    flexShrink: 1,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.textSecondary
  }
});
