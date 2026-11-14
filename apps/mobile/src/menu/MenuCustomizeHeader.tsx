import { Stack, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet } from "react-native";
import { tabDestinations } from "../navigation/destinations";
import { uiPalette } from "../ui/system";

// Modal headers must be visible at mount: changing visibility later remounts the native screen.
export const menuCustomizeHeaderOptions = {
  headerShown: true,
  title: "",
  headerTransparent: true,
  headerShadowVisible: false,
  headerBackVisible: false,
  headerBlurEffect: "none",
  headerTintColor: uiPalette.text
} as const;

/** UIKit supplies the floating glass button; the product image extends beneath the clear bar. */
export function MenuCustomizeHeader() {
  const router = useRouter();
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace(tabDestinations.menu);
  };
  return <Stack.Screen options={{
    ...menuCustomizeHeaderOptions,
    unstable_headerLeftItems: () => [{
      type: "button", label: "Close", accessibilityLabel: "Close item",
      icon: { type: "sfSymbol", name: "xmark" }, onPress: close
    }],
    headerLeft: () => <Pressable accessibilityRole="button" accessibilityLabel="Close item" onPress={close} style={styles.close}>
      <SymbolView name={{ ios: "xmark", android: "close" }} size={22} tintColor={uiPalette.text} />
    </Pressable>
  }} />;
}

const styles = StyleSheet.create({ close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" } });
