import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import type { ScreenStackHeaderConfigProps } from "react-native-screens";

type HeaderBridge = { nativeHeaderConfigurationVersion?: number; supportsNativeBarMinimization?: boolean };

export function nativeAppleHeaderCapabilities() {
  const module = Platform.OS === "ios" ? requireOptionalNativeModule<HeaderBridge>("NomlyGlass") : null;
  const available = (module?.nativeHeaderConfigurationVersion ?? 0) >= 1;
  return {
    available,
    nativeBarMinimization: available && module?.supportsNativeBarMinimization === true
  };
}

/** All added controls are public UIKit settings on the existing native-stack bar. */
export type NativeAppleHeaderConfiguration = Pick<ScreenStackHeaderConfigProps,
  "largeTitleDisplayMode" | "navigationItemStyle" |
  "navigationBarMinimizationBehavior" | "navigationBarRestorationBehavior" |
  "navigationBarSafeAreaAdjustment" | "hidesBarsOnSwipe" | "hidesBarsOnTap" |
  "hidesBarsWhenKeyboardAppears" | "hidesBarsWhenVerticallyCompact"
>;

export function inlineScrollingHeaderConfiguration(nativeBarMinimization: boolean): NativeAppleHeaderConfiguration {
  return {
    largeTitleDisplayMode: "inline",
    navigationItemStyle: "navigator",
    navigationBarMinimizationBehavior: nativeBarMinimization ? "onScrollDown" : "inherit",
    navigationBarRestorationBehavior: "automatic",
    navigationBarSafeAreaAdjustment: "automatic",
    // Never install two competing native hide mechanisms on the same controller.
    hidesBarsOnSwipe: !nativeBarMinimization,
    hidesBarsOnTap: false,
    hidesBarsWhenKeyboardAppears: false,
    hidesBarsWhenVerticallyCompact: false
  };
}
