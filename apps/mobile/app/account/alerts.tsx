import { Ionicons } from "@expo/vector-icons";
import BottomSheet from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthSession } from "../../src/auth/session";
import { AccountFloatingHeader, ACCOUNT_HEADER_HEIGHT } from "../../src/account/AccountFloatingHeader";
import { resolveAppConfigData, useAppConfigQuery } from "../../src/menu/catalog";
import { customerProfileQueryKey, useCustomerProfileQuery } from "../../src/auth/profile";
import { apiClient } from "../../src/api/client";
import { GlassActionPill } from "../../src/cart/GlassActionPill";
import { runAfterKeyboardDismiss } from "../../src/ui/keyboard";
import { Button, Card, GlassCard, ScreenScroll, SectionLabel, uiPalette, uiTypography } from "../../src/ui/system";
import {
  COUNTRY_CODES,
  CountryEntry,
  parsePhoneWithCode,
  CountrySheet,
  DateSheet
} from "../../src/account/ProfileSheets";

export default function ProfilePage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthSession();
  const appConfigQuery = useAppConfigQuery();
  const appConfig = resolveAppConfigData(appConfigQuery.data);
  const headerBackgroundColor = appConfig?.header.background ?? uiPalette.background;
  const headerForegroundColor = appConfig?.header.foreground ?? uiPalette.text;
  const profileQuery = useCustomerProfileQuery(isAuthenticated);
  const profile = profileQuery.data;
  const headerOffset = insets.top + ACCOUNT_HEADER_HEIGHT;

  const [name, setName] = useState("");
  const [dialCode, setDialCode] = useState<CountryEntry>(COUNTRY_CODES[0]);
  const [localPhone, setLocalPhone] = useState("");
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const timeout = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timeout);
  }, [saved]);
  const countrySheetRef = useRef<ComponentRef<typeof BottomSheet>>(null);
  const dateSheetRef = useRef<ComponentRef<typeof BottomSheet>>(null);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name?.trim() ?? profile.displayName?.trim() ?? "");
    const parsed = parsePhoneWithCode(profile.phoneNumber?.trim() ?? "");
    setDialCode(parsed.dial);
    setLocalPhone(parsed.local);
    if (profile.birthday) {
      const d = new Date(profile.birthday + "T00:00:00");
      if (!isNaN(d.getTime())) setBirthday(d);
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const phone = localPhone.trim() ? `${dialCode.code} ${localPhone.trim()}` : undefined;
      return apiClient.saveCustomerProfile({
        name: name.trim(),
        phoneNumber: phone,
        birthday: birthday ? birthday.toISOString().slice(0, 10) : undefined
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(customerProfileQueryKey, updated);
      setSaved(true);
    }
  });

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/account");
  }

  function openCountrySheet() {
    runAfterKeyboardDismiss(() => countrySheetRef.current?.snapToIndex(0));
  }

  function openDateSheet() {
    runAfterKeyboardDismiss(() => dateSheetRef.current?.snapToIndex(0));
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.screenShell}>
        <ScreenScroll
          bottomInset={48}
          contentContainerStyle={[styles.screenContentNoTopPadding, { paddingTop: headerOffset }]}
        >
          <GlassCard style={styles.heroCard}>
            <SectionLabel label="Profile" />
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.heroTitle}>
              Sign in to edit your profile.
            </Text>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.heroBody}>
              Your name, phone, and birthday are tied to your account.
            </Text>
            <Button
              label="Sign In"
              variant="secondary"
              onPress={() => router.push({ pathname: "/auth", params: { returnTo: "/account/alerts" } })}
              style={styles.heroAction}
            />
          </GlassCard>
        </ScreenScroll>
        <AccountFloatingHeader
          title="Profile"
          insetTop={insets.top}
          onBack={goBack}
          backgroundColor={headerBackgroundColor}
          foregroundColor={headerForegroundColor}
        />
      </View>
    );
  }

  const canSave = name.trim().length > 0 && !saveMutation.isPending;

  return (
    <View style={styles.screenShell}>
      <ScreenScroll
        bottomInset={100}
        contentContainerStyle={[styles.screenContentNoTopPadding, { paddingTop: headerOffset }]}
      >
        <GlassCard style={styles.heroCard}>
          <SectionLabel label="Profile" />
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.heroTitle}>
            Your info.
          </Text>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.heroBody}>
            Update your name, phone number, and birthday.
          </Text>
        </GlassCard>

        <Card style={styles.formCard}>
          <View style={styles.fieldGroup}>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.fieldLabel}>
              Full name
            </Text>
            <TextInput
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              autoCapitalize="words"
              autoComplete="name"
              autoCorrect={false}
              placeholder="Avery Quinn"
              placeholderTextColor={uiPalette.textMuted}
              style={styles.textInput}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setSaved(false);
              }}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.fieldLabel}>
              Phone number
            </Text>
            <View style={styles.phoneRow}>
              <TouchableOpacity style={styles.dialButton} onPress={openCountrySheet}>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.dialFlag}>
                  {dialCode.flag}
                </Text>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.dialCode}>
                  {dialCode.code}
                </Text>
                <Ionicons name="chevron-down" size={12} color={uiPalette.textMuted} />
              </TouchableOpacity>
              <View style={styles.phoneDivider} />
              <TextInput
                allowFontScaling={false}
                maxFontSizeMultiplier={1}
                autoComplete="tel"
                autoCorrect={false}
                keyboardType="phone-pad"
                placeholder="313 555 0123"
                placeholderTextColor={uiPalette.textMuted}
                style={[styles.textInput, styles.phoneInput]}
                value={localPhone}
                onChangeText={(v) => {
                  setLocalPhone(v);
                  setSaved(false);
                }}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.fieldGroup, styles.fieldGroupLast, styles.fieldGroupRow]}
            onPress={openDateSheet}
          >
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.fieldLabel}>
              Birthday
            </Text>
            <Text
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              style={birthday ? styles.textInput : styles.textInputPlaceholder}
            >
              {birthday
                ? birthday.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                : "Not set"}
            </Text>
          </TouchableOpacity>

          {profile?.email ? (
            <View style={styles.emailRow}>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.emailLabel}>
                Email
              </Text>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.emailValue}>
                {profile.email}
              </Text>
            </View>
          ) : null}
        </Card>
      </ScreenScroll>

      <View pointerEvents="box-none" style={[styles.bottomDock, { bottom: Math.max(insets.bottom, 16) }]}>
        {saveMutation.isError ? (
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.errorText}>
            Failed to save. Please try again.
          </Text>
        ) : null}
        <GlassActionPill
          label={saveMutation.isPending ? "Saving…" : saved ? "Saved" : "Save changes"}
          onPress={() => {
            void saveMutation.mutateAsync();
          }}
          tone="dark"
          disabled={!canSave}
        />
      </View>

      <CountrySheet
        sheetRef={countrySheetRef}
        selected={dialCode}
        onSelect={(c) => {
          setDialCode(c);
          setSaved(false);
        }}
      />

      <DateSheet
        sheetRef={dateSheetRef}
        value={birthday}
        onChange={(d) => {
          setBirthday(d);
          setSaved(false);
        }}
      />

      <AccountFloatingHeader title="Profile" insetTop={insets.top} onBack={goBack} />
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
  formCard: {
    marginTop: 14,
    gap: 0
  },
  fieldGroup: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border,
    gap: 6
  },
  fieldGroupLast: {
    borderBottomWidth: 0
  },
  fieldLabel: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: uiPalette.textMuted
  },
  textInput: {
    fontSize: 15,
    lineHeight: 22,
    color: uiPalette.text,
    paddingVertical: 0
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0
  },
  dialButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingRight: 10
  },
  dialFlag: {
    fontSize: 18
  },
  dialCode: {
    fontSize: 15,
    lineHeight: 22,
    color: uiPalette.text,
    fontWeight: "500"
  },
  phoneDivider: {
    width: 1,
    height: 18,
    backgroundColor: uiPalette.border,
    marginRight: 10
  },
  phoneInput: {
    flex: 1
  },
  emailRow: {
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: uiPalette.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  emailLabel: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: uiPalette.textMuted
  },
  emailValue: {
    flexShrink: 1,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.textSecondary
  },
  bottomDock: {
    position: "absolute",
    left: 18,
    right: 18,
    gap: 12
  },
  errorText: {
    marginBottom: 4,
    color: "#8A2B0D",
    textAlign: "center",
    fontSize: 13
  },
  fieldGroupRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  textInputPlaceholder: {
    fontSize: 15,
    lineHeight: 22,
    color: uiPalette.textMuted,
    paddingVertical: 0
  }
});
