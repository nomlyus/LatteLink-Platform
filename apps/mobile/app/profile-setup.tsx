import BottomSheet from "@gorhom/bottom-sheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ProfileSetupView } from "../src/account/ProfileSetupView";
import { ScreenState } from "../src/ui/ScreenState";
import { profileBirthdayValue } from "../src/account/profileDate";
import { DateSheet } from "../src/account/ProfileSheets";
import { resolveReturnToPath, getAuthReturnDestination } from "../src/auth/presentation";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../src/api/client";
import { customerProfileQueryKey, isCustomerProfileComplete, useCustomerProfileQuery } from "../src/auth/profile";
import { useAuthSession } from "../src/auth/session";
import { runAfterKeyboardDismiss } from "../src/ui/keyboard";

export default function ProfileSetupScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const { isAuthenticated, isHydrating, completeProfileSetup, deferProfileSetup } = useAuthSession();
  const returnTo = useMemo(() => resolveReturnToPath(params.returnTo), [params.returnTo]);
  const continueIntoApp = useCallback(() => {
    const destination = getAuthReturnDestination(returnTo);
    router.replace(destination);
  }, [returnTo, router]);

  const profileQuery = useCustomerProfileQuery(isAuthenticated && !isHydrating);
  const profile = profileQuery.data;
  const profileComplete = isCustomerProfileComplete(profile);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [birthday, setBirthday] = useState<Date | null>(null);
  const dateSheetRef = useRef<ComponentRef<typeof BottomSheet>>(null);

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
    if (profile.birthday) {
      const parsedBirthday = new Date(profile.birthday + "T00:00:00");
      setBirthday(!isNaN(parsedBirthday.getTime()) ? parsedBirthday : null);
      return;
    }

    setBirthday(null);
  }, [isAuthenticated, isHydrating, profile, router]);

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
      birthday: profileBirthdayValue(birthday)
    });
  }

  function handleSkip() {
    deferProfileSetup();
    continueIntoApp();
  }

  function openDateSheet() {
    runAfterKeyboardDismiss(() => dateSheetRef.current?.snapToIndex(0));
  }

  if (isHydrating || profileQuery.isLoading) {
    return <ScreenState title="Preparing your profile" message="Getting your account details ready." loading />;
  }
  return <>
    <ProfileSetupView name={name} phone={phoneNumber} birthday={birthday}
      onNameChange={setName} onPhoneChange={setPhoneNumber} onBirthdayPress={openDateSheet}
      saving={saveProfileMutation.isPending} saveFailed={saveProfileMutation.isError} lookupFailed={profileQuery.isError}
      onContinue={handleContinue} onSkip={handleSkip} />
    <DateSheet sheetRef={dateSheetRef} value={birthday} onChange={setBirthday} />
  </>;
}
