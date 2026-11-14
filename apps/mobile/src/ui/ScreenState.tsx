import { SymbolView } from "expo-symbols";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button, uiPalette } from "./system";

/** Shared empty/error content. Native stacks continue to own headers and dismissal. */
export function ScreenState({ title, message, loading = false, actionLabel, onAction }: {
  title: string; message: string; loading?: boolean; actionLabel?: string; onAction?: () => void;
}) {
  return <View style={styles.state} accessibilityLiveRegion="polite" accessibilityState={{ busy: loading }}>
    {loading ? <ActivityIndicator size="large" color={uiPalette.textSecondary} />
      : <SymbolView name={{ ios: "info.circle", android: "info" }} size={32} tintColor={uiPalette.textSecondary} />}
    <Text allowFontScaling={false} maxFontSizeMultiplier={1} accessibilityRole="header" style={styles.title}>{title}</Text>
    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.message}>{message}</Text>
    {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" /> : null}
  </View>;
}

const styles = StyleSheet.create({
  state: { paddingHorizontal: 24, paddingVertical: 40, gap: 16, alignItems: "center", width: "100%", maxWidth: 480, alignSelf: "center" },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "700", color: uiPalette.text, textAlign: "center" },
  message: { fontSize: 16, lineHeight: 23, color: uiPalette.textSecondary, textAlign: "center" }
});
