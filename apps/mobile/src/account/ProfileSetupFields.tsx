import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { uiPalette } from "../ui/system";
import { NativeCornerView } from "../ui/NativeCornerView";

export function ProfileSetupFields({ name, phone, birthday, onNameChange, onPhoneChange, onBirthdayPress, disabled = false }: {
  name: string; phone: string; birthday: Date | null; onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void; onBirthdayPress: () => void; disabled?: boolean;
}) {
  return <NativeCornerView cornerMode="fixed" fallbackRadius={20} style={styles.group}>
    <View style={styles.field}>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.label}>Full name</Text>
      <TextInput allowFontScaling={false} maxFontSizeMultiplier={1} accessibilityLabel="Full name" autoCapitalize="words" autoComplete="name" autoCorrect={false}
        placeholder="Your name" placeholderTextColor={uiPalette.textSecondary} style={styles.input} value={name} onChangeText={onNameChange} editable={!disabled} />
    </View>
    <View style={styles.field}>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.label}>Phone · Optional</Text>
      <TextInput allowFontScaling={false} maxFontSizeMultiplier={1} accessibilityLabel="Phone number, optional" keyboardType="phone-pad" autoComplete="tel" autoCorrect={false}
        placeholder="Phone number" placeholderTextColor={uiPalette.textSecondary} style={styles.input} value={phone} onChangeText={onPhoneChange} editable={!disabled} />
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Birthday, optional" onPress={onBirthdayPress} disabled={disabled} style={styles.birthday}>
      <View style={styles.birthdayCopy}><Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.label}>Birthday · Optional</Text>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.input}>{birthday ? birthday.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "Add birthday"}</Text></View>
      <SymbolView name={{ ios: "calendar", android: "calendar_month" }} size={22} tintColor={uiPalette.textSecondary} />
    </Pressable>
  </NativeCornerView>;
}

const styles = StyleSheet.create({
  group: { backgroundColor: uiPalette.card, marginTop: 24 },
  field: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: uiPalette.border },
  label: { color: uiPalette.textSecondary, fontSize: 14, lineHeight: 20 },
  input: { minHeight: 44, paddingVertical: 10, color: uiPalette.text, fontSize: 17 },
  birthday: { padding: 16, minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12 }, birthdayCopy: { flex: 1 }
});
