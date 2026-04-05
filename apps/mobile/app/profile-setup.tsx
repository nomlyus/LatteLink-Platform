import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiClient } from "../src/api/client";
import { customerProfileQueryKey, isCustomerProfileComplete, useCustomerProfileQuery } from "../src/auth/profile";
import { useAuthSession } from "../src/auth/session";
import { Button, uiPalette, uiTypography } from "../src/ui/system";

type ReturnToPath = "cart" | "/(tabs)/home" | "/(tabs)/orders" | "/(tabs)/account";

function resolveReturnToPath(input: string | string[] | undefined): ReturnToPath | null {
  if (Array.isArray(input)) return resolveReturnToPath(input[0]);
  if (input === "cart" || input === "/(tabs)/home" || input === "/(tabs)/orders" || input === "/(tabs)/account") {
    return input;
  }
  return null;
}

export default function ProfileSetupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const { isAuthenticated, isHydrating, completeProfileSetup, deferProfileSetup } = useAuthSession();
  const returnTo = useMemo(() => resolveReturnToPath(params.returnTo), [params.returnTo]);
  const continueIntoApp = useCallback(() => {
    const destination = returnTo === "cart" ? "/cart" : returnTo ?? "/(tabs)/menu";
    router.replace(destination);
  }, [returnTo, router]);

  const profileQuery = useCustomerProfileQuery(isAuthenticated && !isHydrating);
  const profile = profileQuery.data;
  const profileComplete = isCustomerProfileComplete(profile);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [birthday, setBirthday] = useState("");

  const saveProfileMutation = useMutation({
    mutationFn: async (input: { name: string; phoneNumber?: string; birthday?: string }) =>
      apiClient.saveCustomerProfile(input),
    onSuccess: async (updatedProfile) => {
      completeProfileSetup();
      queryClient.setQueryData(customerProfileQueryKey, updatedProfile);
      continueIntoApp();
    }
  });

  useEffect(() => {
    if (!isHydrating && !isAuthenticated) {
      router.replace("/auth");
      return;
    }

    if (!profile) {
      return;
    }

    setName(profile.name ?? profile.displayName ?? "");
    setPhoneNumber(profile.phoneNumber ?? "");
    setBirthday(profile.birthday ?? "");
  }, [profile]);

  useEffect(() => {
    if (!isAuthenticated || isHydrating || profileQuery.isLoading || !profileQuery.isSuccess) {
      return;
    }

    if (profileComplete) {
      continueIntoApp();
    }
  }, [continueIntoApp, isAuthenticated, isHydrating, profileComplete, profileQuery.isLoading, profileQuery.isSuccess]);

  function handleContinue() {
    if (saveProfileMutation.isPending) {
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    saveProfileMutation.mutate({
      name: trimmedName,
      phoneNumber: phoneNumber.trim() || undefined,
      birthday: birthday.trim() || undefined
    });
  }

  function handleSkip() {
    deferProfileSetup();
    continueIntoApp();
  }

  if (isHydrating || profileQuery.isLoading) {
    return (
      <View style={styles.screen}>
        <View style={[styles.handleWrap, styles.handleWrapTop]}>
          <View style={styles.handle} />
        </View>
        <View style={[styles.centerContent, { paddingTop: insets.top + 52 }]}>
          <Text style={styles.title}>Preparing profile setup…</Text>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={uiPalette.primary} />
            <Text style={styles.body}>Loading your account details.</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.handleWrap, styles.handleWrapTop]}>
        <View style={styles.handle} />
      </View>

      <View style={[styles.centerContent, { paddingTop: insets.top + 52 }]}>
        <Text style={styles.title}>Finish your profile.</Text>
        <Text style={styles.body}>Add a name now. Phone and birthday are optional, and you can skip for now.</Text>

        <View style={styles.form}>
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
              onChangeText={setName}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Phone number</Text>
            <TextInput
              autoComplete="tel"
              autoCorrect={false}
              keyboardType="phone-pad"
              placeholder="+1 313 555 0123"
              placeholderTextColor={uiPalette.textMuted}
              style={styles.textInput}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Birthday</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="birthdate-full"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              placeholder="1992-04-12"
              placeholderTextColor={uiPalette.textMuted}
              style={styles.textInput}
              value={birthday}
              onChangeText={setBirthday}
            />
          </View>
        </View>
      </View>

      <View style={[styles.bottomDock, { paddingBottom: Math.max(insets.bottom, 16) + 10 }]}>
        {profileQuery.isError ? (
          <Text style={styles.errorText}>Profile lookup failed. You can still continue or skip.</Text>
        ) : null}
        <Button
          label={saveProfileMutation.isPending ? "Saving…" : "Continue"}
          onPress={handleContinue}
          disabled={saveProfileMutation.isPending || name.trim().length === 0}
        />
        <View style={styles.skipRow}>
          <Button label="Skip for now" variant="secondary" onPress={handleSkip} disabled={saveProfileMutation.isPending} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: uiPalette.background
  },
  handleWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10
  },
  handleWrapTop: {
    paddingTop: 10
  },
  handle: {
    width: 38,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(151, 160, 154, 0.52)"
  },
  centerContent: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 92
  },
  title: {
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -1.1,
    color: uiPalette.text,
    textAlign: "center",
    fontFamily: uiTypography.displayFamily,
    fontWeight: "700"
  },
  body: {
    marginTop: 12,
    maxWidth: 320,
    fontSize: 16,
    lineHeight: 24,
    color: uiPalette.textSecondary,
    textAlign: "center"
  },
  loadingRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  form: {
    width: "100%",
    maxWidth: 360,
    marginTop: 24,
    gap: 16
  },
  fieldGroup: {
    gap: 8
  },
  fieldLabel: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: uiPalette.textSecondary
  },
  textInput: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(23, 21, 19, 0.1)",
    backgroundColor: uiPalette.surfaceStrong,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: uiPalette.text,
    fontSize: 16
  },
  bottomDock: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 10
  },
  skipRow: {
    marginTop: 4
  },
  errorText: {
    marginBottom: 2,
    color: "#8A2B0D",
    textAlign: "center",
    fontSize: 13
  }
});
