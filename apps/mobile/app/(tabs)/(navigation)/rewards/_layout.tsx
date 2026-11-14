import { Stack, useRouter } from "expo-router";
import { nativeAppleHeaderCapabilities } from "../../../../src/navigation/nativeAppleHeader";
import { nativeScrollablePageHeaderOptions } from "../../../../src/navigation/nativeApplePageHeaderOptions";
import { accountHeaderOptions } from "../../../../src/navigation/accountHeaderOptions";
import { uiPalette } from "../../../../src/ui/systemColors";

export default function RewardsLayout() {
  const router = useRouter();
  const capabilities = nativeAppleHeaderCapabilities();
  const openAccount = () => router.push("/(tabs)/account");
  return <Stack screenOptions={capabilities.available
    ? nativeScrollablePageHeaderOptions("Rewards", openAccount, capabilities.nativeBarMinimization)
    : { title: "Rewards", headerShown: true, headerTintColor: uiPalette.accent, ...accountHeaderOptions(openAccount) }
  } />;
}
