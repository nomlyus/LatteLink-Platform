import { Stack } from "expo-router";
import { AccountSheetSurface } from "../../../src/account/AccountSheetSurface";
import { AccountSheetNavigation } from "../../../src/account/AccountSheetNavigation";
import { uiPalette } from "../../../src/ui/systemColors";

export const unstable_settings = { initialRouteName: "index" };

export default function AccountSheetLayout() {
  return (
    <AccountSheetSurface>
      <AccountSheetNavigation>
      <Stack screenOptions={{
        headerShown: true,
        // Opaque headers add a second, asynchronously resolved safe-area wrapper on iOS 26+.
        // Let each scroll view inset beneath the native header instead.
        headerTransparent: true,
        headerStyle: { backgroundColor: "transparent" },
        headerTintColor: uiPalette.accent,
        headerTitleStyle: { color: uiPalette.text },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        // ScrollViewMarker requires the opt-in Gamma native build; use the existing stack API.
        scrollEdgeEffects: { top: "soft" },
        contentStyle: { backgroundColor: "transparent" }
      }}>
        {/* Keep the native bar laid out before a push; hiding it here makes UIKit insert it mid-transition. */}
        <Stack.Screen name="index" options={{ title: "", headerBackVisible: false, scrollEdgeEffects: { top: "hidden" } }} />
        <Stack.Screen name="details/rewards" options={{ title: "Rewards" }} />
        <Stack.Screen name="details/profile" options={{ title: "Profile" }} />
        <Stack.Screen name="details/settings" options={{ title: "Settings" }} />
      </Stack>
      </AccountSheetNavigation>
    </AccountSheetSurface>
  );
}
