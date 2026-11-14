import { accountHeaderOptions } from "./accountHeaderOptions";
import { inlineScrollingHeaderConfiguration } from "./nativeAppleHeader";
import { uiPalette } from "../ui/systemColors";

/** Set before the first native frame so the route name never flashes as the title. */
export function nativeApplePageHeaderOptions(
  title: string,
  openAccount: (() => void) | null,
  nativeBarMinimization: boolean
) {
  return {
    title,
    headerShown: true,
    headerLargeTitleEnabled: true,
    headerTintColor: uiPalette.accent,
    headerTitleStyle: { color: uiPalette.text },
    headerLargeTitleStyle: { color: uiPalette.text },
    headerStyle: undefined,
    headerLargeStyle: { backgroundColor: "transparent" },
    headerTransparent: true,
    headerShadowVisible: false,
    headerLargeTitleShadowVisible: false,
    scrollEdgeEffects: { top: "soft" as const },
    contentStyle: { backgroundColor: uiPalette.background },
    ...(openAccount ? accountHeaderOptions(openAccount) : {
      headerRight: () => null,
      unstable_headerRightItems: () => []
    }),
    unstable_nativeProps: { headerConfig: inlineScrollingHeaderConfiguration(nativeBarMinimization) }
  };
}

/** The scroll view registers its soft edge after mount, when Screens can actually find it. */
export function nativeScrollablePageHeaderOptions(title: string, openAccount: (() => void) | null, nativeBarMinimization: boolean) {
  const options = nativeApplePageHeaderOptions(title, openAccount, nativeBarMinimization);
  return {
    ...options,
    headerBlurEffect: "none" as const,
    scrollEdgeEffects: { top: "automatic" as const }
  };
}
