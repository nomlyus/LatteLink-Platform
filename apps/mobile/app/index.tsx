import { View } from "react-native";
import { Redirect } from "expo-router";
import { useCustomerProfileQuery, isCustomerProfileComplete } from "../src/auth/profile";
import { useAuthSession } from "../src/auth/session";
import { uiPalette } from "../src/ui/system";

export default function IndexScreen() {
  const { isAuthenticated, isHydrating, profileSetupDeferred } = useAuthSession();
  const profileQuery = useCustomerProfileQuery(isAuthenticated && !isHydrating);
  const profile = profileQuery.data;
  const profileComplete = isCustomerProfileComplete(profile);

  if (isHydrating || profileQuery.isLoading) {
    return <View style={{ flex: 1, backgroundColor: uiPalette.background }} />;
  }

  if (isAuthenticated) {
    if (!profileQuery.isSuccess || (!profileComplete && !profileSetupDeferred)) {
      return <Redirect href="/profile-setup" />;
    }

    return <Redirect href="/(tabs)/home" />;
  }

  return <Redirect href="/(tabs)/home" />;
}
