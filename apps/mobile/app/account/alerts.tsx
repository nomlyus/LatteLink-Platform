import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthSession } from "../../src/auth/session";
import { AccountFloatingHeader, ACCOUNT_HEADER_HEIGHT } from "../../src/account/AccountFloatingHeader";
import { resolveAppConfigData, useAppConfigQuery } from "../../src/menu/catalog";
import { customerProfileQueryKey, useCustomerProfileQuery } from "../../src/auth/profile";
import { apiClient } from "../../src/api/client";
import { GlassActionPill } from "../../src/cart/GlassActionPill";
import { Button, Card, GlassCard, ScreenScroll, SectionLabel, uiPalette, uiTypography } from "../../src/ui/system";

const COUNTRY_CODES = [
  { code: "+1", flag: "🇺🇸", name: "United States" },
  { code: "+1", flag: "🇨🇦", name: "Canada" },
  { code: "+44", flag: "🇬🇧", name: "United Kingdom" },
  { code: "+61", flag: "🇦🇺", name: "Australia" },
  { code: "+49", flag: "🇩🇪", name: "Germany" },
  { code: "+33", flag: "🇫🇷", name: "France" },
  { code: "+34", flag: "🇪🇸", name: "Spain" },
  { code: "+39", flag: "🇮🇹", name: "Italy" },
  { code: "+81", flag: "🇯🇵", name: "Japan" },
  { code: "+82", flag: "🇰🇷", name: "South Korea" },
  { code: "+86", flag: "🇨🇳", name: "China" },
  { code: "+91", flag: "🇮🇳", name: "India" },
  { code: "+52", flag: "🇲🇽", name: "Mexico" },
  { code: "+55", flag: "🇧🇷", name: "Brazil" },
  { code: "+971", flag: "🇦🇪", name: "UAE" },
  { code: "+966", flag: "🇸🇦", name: "Saudi Arabia" },
  { code: "+20", flag: "🇪🇬", name: "Egypt" },
  { code: "+27", flag: "🇿🇦", name: "South Africa" },
  { code: "+31", flag: "🇳🇱", name: "Netherlands" },
  { code: "+46", flag: "🇸🇪", name: "Sweden" },
];

type CountryEntry = typeof COUNTRY_CODES[number];

function parsePhoneWithCode(raw: string): { dial: CountryEntry; local: string } {
  const defaultDial = COUNTRY_CODES[0];
  if (!raw) return { dial: defaultDial, local: "" };
  const match = COUNTRY_CODES.find(c => raw.startsWith(c.code + " ") || raw.startsWith(c.code));
  if (match) {
    const local = raw.slice(match.code.length).replace(/^\s+/, "");
    return { dial: match, local };
  }
  return { dial: defaultDial, local: raw };
}

function CountrySheet({
  sheetRef,
  selected,
  onSelect
}: {
  sheetRef: React.RefObject<ComponentRef<typeof BottomSheet>>;
  selected: CountryEntry;
  onSelect: (c: CountryEntry) => void;
}) {
  const snapPoints = useMemo(() => [260], []);
  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.36} pressBehavior="close" />
    ),
    []
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      animateOnMount={false}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.sheetHandle}
    >
      <BottomSheetView>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Country Code</Text>
          <TouchableOpacity onPress={() => sheetRef.current?.close()} style={styles.sheetDone}>
            <Text style={styles.sheetDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
        <Picker
          selectedValue={selected.name}
          onValueChange={(name) => {
            const found = COUNTRY_CODES.find(c => c.name === name);
            if (found) onSelect(found);
          }}
          itemStyle={styles.pickerItem}
        >
          {COUNTRY_CODES.map((c) => (
            <Picker.Item key={c.name} label={`${c.flag}  ${c.name}  ${c.code}`} value={c.name} />
          ))}
        </Picker>
      </BottomSheetView>
    </BottomSheet>
  );
}

function DateSheet({
  sheetRef,
  value,
  onChange
}: {
  sheetRef: React.RefObject<ComponentRef<typeof BottomSheet>>;
  value: Date | null;
  onChange: (d: Date) => void;
}) {
  const snapPoints = useMemo(() => [300], []);
  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.36} pressBehavior="close" />
    ),
    []
  );
  const maxDate = new Date();
  const defaultDate = value ?? new Date(new Date().getFullYear() - 25, 0, 1);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      animateOnMount={false}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.sheetHandle}
    >
      <BottomSheetView>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Birthday</Text>
          <TouchableOpacity onPress={() => sheetRef.current?.close()} style={styles.sheetDone}>
            <Text style={styles.sheetDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.datePickerWrap}>
          <DateTimePicker
            value={defaultDate}
            mode="date"
            display="spinner"
            maximumDate={maxDate}
            onChange={(_, date) => { if (date) onChange(date); }}
            style={styles.datePicker}
            textColor={uiPalette.text}
          />
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthSession();
  const appConfigQuery = useAppConfigQuery();
  const appConfig = resolveAppConfigData(appConfigQuery.data);
  const profileQuery = useCustomerProfileQuery(isAuthenticated);
  const profile = profileQuery.data;
  const headerOffset = insets.top + ACCOUNT_HEADER_HEIGHT;

  const [name, setName] = useState("");
  const [dialCode, setDialCode] = useState<CountryEntry>(COUNTRY_CODES[0]);
  const [localPhone, setLocalPhone] = useState("");
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [saved, setSaved] = useState(false);
  const countrySheetRef = useRef<ComponentRef<typeof BottomSheet>>(null) as React.RefObject<ComponentRef<typeof BottomSheet>>;
  const dateSheetRef = useRef<ComponentRef<typeof BottomSheet>>(null) as React.RefObject<ComponentRef<typeof BottomSheet>>;

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
      setTimeout(() => setSaved(false), 2500);
    }
  });

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
            <SectionLabel label="Profile" />
            <Text style={styles.heroTitle}>Sign in to edit your profile.</Text>
            <Text style={styles.heroBody}>Your name, phone, and birthday are tied to your account.</Text>
            <Button
              label="Sign In"
              variant="secondary"
              onPress={() => router.push({ pathname: "/auth", params: { returnTo: "/account/alerts" } })}
              style={styles.heroAction}
            />
          </GlassCard>
        </ScreenScroll>
        <AccountFloatingHeader title="Profile" insetTop={insets.top} onBack={goBack} backgroundColor={appConfig.header.background} foregroundColor={appConfig.header.foreground} />
      </View>
    );
  }

  const canSave = name.trim().length > 0 && !saveMutation.isPending;

  return (
    <View style={styles.screenShell}>
      <ScreenScroll bottomInset={100} contentContainerStyle={[styles.screenContentNoTopPadding, { paddingTop: headerOffset }]}>
        <GlassCard style={styles.heroCard}>
          <SectionLabel label="Profile" />
          <Text style={styles.heroTitle}>Your info.</Text>
          <Text style={styles.heroBody}>Update your name, phone number, and birthday.</Text>
        </GlassCard>

        <Card style={styles.formCard}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Full name</Text>
            <TextInput
              autoCapitalize="words"
              autoComplete="name"
              autoCorrect={false}
              placeholder="Avery Quinn"
              placeholderTextColor={uiPalette.textMuted}
              style={styles.textInput}
              value={name}
              onChangeText={(v) => { setName(v); setSaved(false); }}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Phone number</Text>
            <View style={styles.phoneRow}>
              <TouchableOpacity style={styles.dialButton} onPress={() => countrySheetRef.current?.snapToIndex(0)}>
                <Text style={styles.dialFlag}>{dialCode.flag}</Text>
                <Text style={styles.dialCode}>{dialCode.code}</Text>
                <Ionicons name="chevron-down" size={12} color={uiPalette.textMuted} />
              </TouchableOpacity>
              <View style={styles.phoneDivider} />
              <TextInput
                autoComplete="tel"
                autoCorrect={false}
                keyboardType="phone-pad"
                placeholder="313 555 0123"
                placeholderTextColor={uiPalette.textMuted}
                style={[styles.textInput, styles.phoneInput]}
                value={localPhone}
                onChangeText={(v) => { setLocalPhone(v); setSaved(false); }}
              />
            </View>
          </View>

          <TouchableOpacity style={[styles.fieldGroup, styles.fieldGroupLast, styles.fieldGroupRow]} onPress={() => dateSheetRef.current?.snapToIndex(0)}>
            <Text style={styles.fieldLabel}>Birthday</Text>
            <Text style={birthday ? styles.textInput : styles.textInputPlaceholder}>
              {birthday ? birthday.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Not set"}
            </Text>
          </TouchableOpacity>

          {profile?.email ? (
            <View style={styles.emailRow}>
              <Text style={styles.emailLabel}>Email</Text>
              <Text style={styles.emailValue}>{profile.email}</Text>
            </View>
          ) : null}
        </Card>
      </ScreenScroll>

      <View pointerEvents="box-none" style={[styles.bottomDock, { bottom: Math.max(insets.bottom, 16) }]}>
        {saveMutation.isError ? (
          <Text style={styles.errorText}>Failed to save. Please try again.</Text>
        ) : null}
        <GlassActionPill
          label={saveMutation.isPending ? "Saving…" : saved ? "Saved" : "Save changes"}
          onPress={() => { void saveMutation.mutateAsync(); }}
          tone="dark"
          disabled={!canSave}
        />
      </View>

      <CountrySheet
        sheetRef={countrySheetRef}
        selected={dialCode}
        onSelect={(c) => { setDialCode(c); setSaved(false); }}
      />

      <DateSheet
        sheetRef={dateSheetRef}
        value={birthday}
        onChange={(d) => { setBirthday(d); setSaved(false); }}
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
  sheetBg: {
    backgroundColor: uiPalette.surfaceStrong,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: uiPalette.borderStrong
  },
  sheetHandle: {
    backgroundColor: "rgba(151,160,154,0.52)"
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 2
  },
  sheetTitle: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: uiPalette.textMuted
  },
  sheetDone: {
    paddingVertical: 6,
    paddingLeft: 16
  },
  sheetDoneText: {
    fontSize: 16,
    fontWeight: "600",
    color: uiPalette.primary
  },
  pickerItem: {
    fontSize: 17,
    color: uiPalette.text
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
  },
  datePicker: {
    width: "100%",
    height: 200,
    alignSelf: "center"
  },
  datePickerWrap: {
    alignItems: "center",
    justifyContent: "center"
  }
});
