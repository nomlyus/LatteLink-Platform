import { Redirect, Stack } from "expo-router";
import { designPreviewsEnabled } from "../../src/dev/previewEnabled";
import { uiPalette } from "../../src/ui/system";

export default function DesignPreviewLayout() {
  if (!designPreviewsEnabled) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: true, title: "Design previews",
    headerBackButtonDisplayMode: "minimal", headerShadowVisible: false,
    headerTintColor: uiPalette.accent, headerTitleStyle: { color: uiPalette.text },
    contentStyle: { backgroundColor: uiPalette.backgroundAlt }
  }} />;
}
