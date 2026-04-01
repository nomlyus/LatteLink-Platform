import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthSession } from "../../src/auth/session";
import { AccountFloatingHeader, ACCOUNT_HEADER_HEIGHT } from "../../src/account/AccountFloatingHeader";
import { resolveAppConfigData, useAppConfigQuery } from "../../src/menu/catalog";
import { Button, Card, Chip, GlassCard, ScreenScroll, SectionLabel, uiPalette, uiTypography } from "../../src/ui/system";

function DetailRow({
  label,
  value,
  showDivider = true
}: {
  label: string;
  value: string;
  showDivider?: boolean;
}) {
  return (
    <View style={[styles.detailRow, showDivider ? styles.detailRowDivider : null]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, signOut } = useAuthSession();
  const appConfig = resolveAppConfigData(useAppConfigQuery().data);
  const loyaltyEnabled = appConfig.loyaltyEnabled && appConfig.featureFlags.loyalty;
  const pushEnabled = appConfig.featureFlags.pushNotifications;
  const headerOffset = insets.top + ACCOUNT_HEADER_HEIGHT;
  const [signOutPending, setSignOutPending] = useState(false);

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/(tabs)/account");
  }

  async function handleSignOut() {
    setSignOutPending(true);
    try {
      await signOut();
      router.dismissTo("/(tabs)/home");
    } finally {
      setSignOutPending(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.screenShell}>
        <ScreenScroll bottomInset={48} contentContainerStyle={[styles.screenContentNoTopPadding, { paddingTop: headerOffset }]}>
          <GlassCard style={styles.heroCard}>
            <SectionLabel label="Settings" />
            <Text style={styles.heroTitle}>Sign in to manage settings.</Text>
            <Text style={styles.heroBody}>Account settings and sign-out controls appear here once you are signed in.</Text>
            <Button
              label="Sign In"
              variant="secondary"
              onPress={() => router.push({ pathname: "/auth", params: { returnTo: "/account/settings" } })}
              style={styles.heroAction}
            />
          </GlassCard>
        </ScreenScroll>

        <AccountFloatingHeader title="Settings" insetTop={insets.top} onBack={goBack} />
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

        <Card style={styles.sectionCard}>
          <SectionLabel label="App" />
          <View style={styles.detailGroup}>
            <DetailRow label="Location" value={appConfig.brand.locationName} />
            <DetailRow label="Alerts" value={pushEnabled ? "Enabled" : "Disabled"} />
            <DetailRow label="Loyalty" value={loyaltyEnabled ? "Enabled" : "Disabled"} showDivider={false} />
          </View>
        </Card>

        <Card style={styles.signOutCard}>
          <Button
            label={signOutPending ? "Signing Out…" : "Sign Out"}
            variant="ghost"
            onPress={() => {
              void handleSignOut();
            }}
            disabled={signOutPending}
            style={styles.signOutButton}
          />
        </Card>
      </ScreenScroll>

      <AccountFloatingHeader title="Settings" insetTop={insets.top} onBack={goBack} />
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
  sectionCard: {
    marginTop: 14
  },
  detailGroup: {
    marginTop: 14
  },
  detailRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  detailRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border
  },
  detailLabel: {
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.textSecondary
  },
  detailValue: {
    flexShrink: 1,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  },
  signOutCard: {
    marginTop: 14,
    marginBottom: 8,
    alignItems: "stretch"
  },
  signOutButton: {
    alignSelf: "stretch"
  }
});
