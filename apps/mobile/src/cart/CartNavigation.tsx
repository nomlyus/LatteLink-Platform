import { requireOptionalNativeModule } from "expo";
import { Stack, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Platform, Pressable, Text } from "react-native";
import { uiPalette } from "../ui/system";

export const nativeCartToolbarAvailable = Platform.OS === "ios" && !!requireOptionalNativeModule("ExpoRouterToolbarModule");

export const cartHeaderOptions = {
  headerShown: true,
  title: "Cart",
  headerTitleAlign: "center",
  headerTransparent: true,
  headerBlurEffect: "none",
  headerShadowVisible: false,
  headerStyle: { backgroundColor: "transparent" },
  scrollEdgeEffects: { top: "soft" },
  headerTintColor: uiPalette.text,
  headerBackVisible: false
} as const;

export function CartHeader({ onClear, paymentInProgress = false }: { onClear?: () => void; paymentInProgress?: boolean } = {}) {
  const router = useRouter();
  const close = () => {
    if (paymentInProgress) return;
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/(navigation)/menu");
  };
  return <Stack.Screen options={{
    ...cartHeaderOptions,
    gestureEnabled: !paymentInProgress,
    unstable_headerLeftItems: () => [{
      type: "button", label: "Close", accessibilityLabel: "Close cart",
      disabled: paymentInProgress,
      icon: { type: "sfSymbol", name: "xmark" }, onPress: close
    }],
    unstable_headerRightItems: () => onClear ? [{
      type: "button", label: "Clear", accessibilityLabel: "Clear cart", onPress: onClear
    }] : [],
    headerRight: () => onClear ? <Pressable accessibilityRole="button" accessibilityLabel="Clear cart"
      onPress={onClear} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={{ color: uiPalette.text, fontSize: 17 }}>Clear</Text>
    </Pressable> : null,
    headerLeft: () => <Pressable disabled={paymentInProgress} accessibilityRole="button" accessibilityLabel="Close cart" onPress={close}
      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
      <SymbolView name={{ ios: "xmark", android: "close" }} size={22} tintColor={uiPalette.text} />
    </Pressable>
  }} />;
}

export { CartCheckoutToolbar } from "./CartCheckoutToolbar";
