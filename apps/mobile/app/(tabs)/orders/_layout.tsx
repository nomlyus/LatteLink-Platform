import { SymbolView } from "expo-symbols";
import { Stack, useRouter } from "expo-router";
import { Pressable } from "react-native";
import { uiPalette } from "../../../src/ui/system";
import { AccountSheetSurface } from "../../../src/account/AccountSheetSurface";

export default function HistoryLayout() {
  const router = useRouter();
  const close = () => router.dismiss();
  return (
    <AccountSheetSurface contentTopPadding={8}><Stack screenOptions={{
      title: "Orders",
      headerShown: true,
      headerLargeTitleEnabled: false,
      headerTitleAlign: "center",
      headerBackButtonDisplayMode: "minimal",
      headerTransparent: true,
      headerStyle: { backgroundColor: "transparent" },
      headerLargeStyle: { backgroundColor: "transparent" },
      headerShadowVisible: false,
      headerTintColor: uiPalette.text,
      headerTitleStyle: { color: uiPalette.text },
      headerRight: () => null,
      unstable_headerRightItems: () => [],
      headerBlurEffect: "none",
      scrollEdgeEffects: { top: "hidden" },
      contentStyle: { backgroundColor: "transparent" }
    }}>
      <Stack.Screen name="index" options={{
        title: "Orders",
        unstable_headerLeftItems: () => [{
          type: "button", label: "Close", accessibilityLabel: "Close orders",
          icon: { type: "sfSymbol", name: "xmark" }, onPress: close
        }],
        headerLeft: () => <Pressable accessibilityRole="button" accessibilityLabel="Close orders" onPress={close}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <SymbolView name={{ ios: "xmark", android: "close" }} size={24} tintColor={uiPalette.text} />
        </Pressable>
      }} />
      <Stack.Screen name="month" options={{ title: "Orders" }} />
      <Stack.Screen name="detail" options={{ title: "" }} />
    </Stack></AccountSheetSurface>
  );
}
