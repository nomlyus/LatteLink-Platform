import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthSession } from "../../src/auth/session";
import { AccountFloatingHeader, ACCOUNT_HEADER_HEIGHT } from "../../src/account/AccountFloatingHeader";
import { resolveAppConfigData, useAppConfigQuery } from "../../src/menu/catalog";
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

function DetailRow({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export default function SessionPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, session } = useAuthSession();
  const appConfig = resolveAppConfigData(useAppConfigQuery().data);
  const headerOffset = insets.top + ACCOUNT_HEADER_HEIGHT;

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
            <SectionLabel label="Session" />
            <Text style={styles.heroTitle}>Sign in to view session details.</Text>
            <Text style={styles.heroBody}>Session state appears here for authenticated users.</Text>
            <Button
              label="Sign In"
              variant="secondary"
              onPress={() => router.push({ pathname: "/auth", params: { returnTo: "/account/session" } })}
              style={styles.heroAction}
            />
          </GlassCard>
        </ScreenScroll>

        <AccountFloatingHeader title="Session" insetTop={insets.top} onBack={goBack} />
      </View>
    );
  }

  return (
    <View style={styles.screenShell}>
      <ScreenScroll bottomInset={48} contentContainerStyle={[styles.screenContentNoTopPadding, { paddingTop: headerOffset }]}>
        <GlassCard style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              <SectionLabel label="Secure session" />
              <Text style={styles.heroTitle}>{`Member ${session?.userId.slice(0, 8).toUpperCase()}`}</Text>
              <Text style={styles.heroBody}>{appConfig.brand.locationName}</Text>
            </View>
            <Chip label="Secure" active />
          </View>
        </GlassCard>

        <Card style={styles.sectionCard}>
          <SectionLabel label="Details" />
          <View style={styles.detailGroup}>
            <DetailRow label="User ID" value={session?.userId.slice(0, 8).toUpperCase() ?? "--"} />
            <DetailRow label="Expires" value={formatDateTime(session?.expiresAt ?? "")} />
            <DetailRow label="Location" value={appConfig.brand.locationName} />
          </View>
        </Card>
      </ScreenScroll>

      <AccountFloatingHeader title="Session" insetTop={insets.top} onBack={goBack} />
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
    gap: 16,
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
  }
});
