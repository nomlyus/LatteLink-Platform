import { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useCustomerProfileQuery, isCustomerProfileComplete } from "../src/auth/profile";
import { useAuthSession } from "../src/auth/session";
import { uiPalette } from "../src/ui/system";

export default function IndexScreen() {
  const router = useRouter();
  const { isAuthenticated, isHydrating, profileSetupDeferred } = useAuthSession();
  const profileQuery = useCustomerProfileQuery(isAuthenticated && !isHydrating);
  const profile = profileQuery.data;
  const profileComplete = isCustomerProfileComplete(profile);

  useEffect(() => {
    if (isHydrating || profileQuery.isLoading) {
      return;
    }

    if (isAuthenticated) {
      if (!profileQuery.isSuccess || (!profileComplete && !profileSetupDeferred)) {
        router.replace("/profile-setup");
        return;
      }

      router.replace("/(tabs)/home");
      return;
    }

    router.replace("/(tabs)/home");
  }, [isAuthenticated, isHydrating, profileComplete, profileQuery.isLoading, profileQuery.isSuccess, profileSetupDeferred, router]);

  return <View style={{ flex: 1, backgroundColor: uiPalette.background }} />;
}
