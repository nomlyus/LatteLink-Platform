import { StyleSheet, Text } from "react-native";
import { uiPalette } from "../ui/system";

/** Keep large leading titles in the native bar, aligned with its account item. */
export function leadingHeaderTitleOptions(title: string) {
  const renderTitle = () => (
    <Text allowFontScaling={false} maxFontSizeMultiplier={1} accessibilityRole="header" style={styles.title}>
      {title}
    </Text>
  );

  return {
    headerTitle: "",
    headerLeft: renderTitle,
    unstable_headerLeftItems: () => [
      { type: "custom" as const, element: renderTitle(), hidesSharedBackground: true }
    ]
  };
}

const styles = StyleSheet.create({
  title: { fontSize: 34, fontWeight: "700", color: uiPalette.text, letterSpacing: -0.8 }
});
