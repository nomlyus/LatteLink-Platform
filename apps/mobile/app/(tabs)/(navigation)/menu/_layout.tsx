import { Stack, useRouter } from "expo-router";
import { accountHeaderOptions } from "../../../../src/navigation/accountHeaderOptions";
import { leadingHeaderTitleOptions } from "../../../../src/navigation/leadingHeaderTitleOptions";
import { uiPalette } from "../../../../src/ui/system";
import { nativeAppleHeaderCapabilities } from "../../../../src/navigation/nativeAppleHeader";
import { nativeScrollablePageHeaderOptions } from "../../../../src/navigation/nativeApplePageHeaderOptions";

export default function MenuLayout() {
  const router = useRouter();
  const capabilities = nativeAppleHeaderCapabilities();

  if (capabilities.available) {
    return <Stack screenOptions={nativeScrollablePageHeaderOptions(
      "Menu", () => router.push("/(tabs)/account"), capabilities.nativeBarMinimization
    )} />;
  }

  return (
    <Stack screenOptions={{
      title: "Menu",
      headerShown: true,
      headerLargeTitleEnabled: false,
      ...leadingHeaderTitleOptions("Menu"),
      headerTransparent: true,
      headerStyle: { backgroundColor: "transparent" },
      // This also controls a regular title's scroll-edge appearance; clear it to avoid an opaque UIKit background.
      headerLargeStyle: { backgroundColor: "transparent" },
      headerShadowVisible: false,
      headerTintColor: uiPalette.accent,
      ...accountHeaderOptions(() => router.push("/(tabs)/account")),
      headerBlurEffect: "none",
      scrollEdgeEffects: { top: "hidden" },
      contentStyle: { backgroundColor: uiPalette.background }
    }} />
  );
}
