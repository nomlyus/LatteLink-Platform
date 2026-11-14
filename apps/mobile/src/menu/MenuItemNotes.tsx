import { StyleSheet, Text, TextInput, View } from "react-native";
import { uiPalette } from "../ui/system";

/** On iOS a multiline TextInput is backed by RCTUITextView, a UIKit UITextView subclass. */
export function MenuItemNotes({ value, onChangeText }: { value: string; onChangeText: (notes: string) => void }) {
  return <View style={styles.section}>
    <Text allowFontScaling={false} maxFontSizeMultiplier={1} accessibilityRole="header" style={styles.title}>Notes</Text>
    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.hint}>Optional instructions for the barista.</Text>
    <TextInput allowFontScaling={false} maxFontSizeMultiplier={1} multiline scrollEnabled={false}
      accessibilityLabel="Order notes, optional" placeholder="e.g. Less ice or no foam"
      placeholderTextColor={uiPalette.textMuted} selectionColor={uiPalette.primary}
      value={value} onChangeText={onChangeText} style={styles.input} />
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: 24, paddingHorizontal: 20, gap: 10 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: "600", color: uiPalette.text },
  hint: { fontSize: 14, lineHeight: 20, color: uiPalette.textSecondary },
  input: { minHeight: 104, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: uiPalette.border,
    backgroundColor: uiPalette.surfaceStrong, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 17, lineHeight: 23, color: uiPalette.text, textAlignVertical: "top" }
});
