import { useIsFocused } from "expo-router";
import { type ReactNode, useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-screens/experimental";
import { uiPalette } from "../ui/system";
import { FallbackCartAccessory } from "./FallbackCartAccessory";
import { supportsNativeCartAccessory } from "./cartAccessoryModel";
import { getNativeTabContentBottomInset, TabContentLayoutContext, type TabContentLayout } from "./tabContentLayout";

export function NativeTabScreen({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const nativeAccessory = supportsNativeCartAccessory(Platform.OS, Platform.Version);
  const layout = useMemo<TabContentLayout>(
    () => ({
      native: true,
      contentBottomInset: getNativeTabContentBottomInset(nativeAccessory ? insets.bottom : 0)
    }),
    [nativeAccessory, insets.bottom]
  );

  const content = (
    <>
      <View style={styles.content} collapsable={false}>
        {children}
      </View>
      {!nativeAccessory && focused ? <FallbackCartAccessory /> : null}
    </>
  );

  return (
    <TabContentLayoutContext value={layout}>
      {nativeAccessory ? (
        // Preserve the native first-child chain used by UIKit for scroll-driven minimization.
        <View style={styles.screen} collapsable={false}>
          {content}
        </View>
      ) : (
        <SafeAreaView edges={{ bottom: true }} style={styles.screen}>
          {content}
        </SafeAreaView>
      )}
    </TabContentLayoutContext>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: uiPalette.background },
  content: { flex: 1 }
});
