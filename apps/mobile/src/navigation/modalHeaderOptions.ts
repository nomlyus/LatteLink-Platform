import { uiPalette } from "../ui/systemColors";

/** A native navigation bar, with content insets supplied by each scroll view. */
export function modalHeaderOptions(title: string, close: () => void) {
  return {
    title, headerShown: true, headerTitleAlign: "center" as const,
    headerShadowVisible: false, headerBackButtonDisplayMode: "minimal" as const,
    headerTintColor: uiPalette.accent, headerTitleStyle: { color: uiPalette.text },
    contentStyle: { backgroundColor: uiPalette.backgroundAlt },
    unstable_headerLeftItems: () => [{ type: "button" as const, label: "Close", accessibilityLabel: `Close ${title}`,
      icon: { type: "sfSymbol" as const, name: "xmark" as const }, onPress: close }]
  };
}
