import { NativeTabs } from "expo-router/native-tabs";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Platform } from "react-native";
import { useCart } from "../cart/store";
import { bottomTabs } from "./bottomTabs";
import { NativeCartAccessory } from "./CartAccessory";
import { getCartAccessorySummary, getCartNavigationState } from "./cartAccessoryModel";
import { uiPalette } from "../ui/systemColors";

/** SDK-matched system tabs; root-stack cart/auth/checkout routes remain siblings. */
export function NativeBottomTabNavigator() {
  const { itemCount, subtotalCents } = useCart();
  const router = useRouter();
  const { minimizeBehavior, showNativeAccessory } = getCartNavigationState(itemCount, Platform.OS, Platform.Version);
  const summary = useMemo(() => getCartAccessorySummary(itemCount, subtotalCents), [itemCount, subtotalCents]);
  const openCart = useCallback(() => router.push("/cart"), [router]);

  return (
    <NativeTabs
      backBehavior="initialRoute"
      minimizeBehavior={minimizeBehavior}
      tintColor={uiPalette.chromeText}
      iconColor={{ default: uiPalette.chromeMuted, selected: uiPalette.chromeText }}
      labelStyle={{ fontSize: 12, fontWeight: "500" }}
      backgroundColor="transparent"
      shadowColor="transparent"
      labelVisibilityMode="unlabeled"
    >
      {bottomTabs.map((tab) => (
        <NativeTabs.Trigger
          key={tab.name}
          name={tab.name}
          accessibilityLabel={tab.title}
          role={tab.name === "search" ? "search" : undefined}
          disableAutomaticContentInsets
          disablePopToTop
          disableScrollToTop
        >
          <NativeTabs.Trigger.Label hidden>{tab.title}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={tab.nativeIcon.sf} md={tab.nativeIcon.md} />
        </NativeTabs.Trigger>
      ))}
      {showNativeAccessory ? (
        <NativeTabs.BottomAccessory>
          <NativeCartAccessory summary={summary} onOpenCart={openCart} />
        </NativeTabs.BottomAccessory>
      ) : null}
    </NativeTabs>
  );
}
