import type { ComponentProps } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProfileSetupFields } from "./ProfileSetupFields";
import { GlassActionPill } from "../cart/GlassActionPill";
import { uiPalette } from "../ui/system";

/** Real and preview flows share the whole form; only the caller owns persistence and navigation. */
export function ProfileSetupView({ saving = false, saveFailed = false, lookupFailed = false, onContinue, onSkip, ...fields }:
  Omit<ComponentProps<typeof ProfileSetupFields>, "disabled"> & {
    saving?: boolean; saveFailed?: boolean; lookupFailed?: boolean; onContinue: () => void; onSkip: () => void;
  }) {
  const insets = useSafeAreaInsets();
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} accessibilityRole="header" style={styles.title}>Make yourself at home.</Text>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.body}>Add your name so we know who to call when your order is ready. Phone and birthday are optional.</Text>
      <ProfileSetupFields {...fields} disabled={saving} />
    </ScrollView>
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {saveFailed ? <Text allowFontScaling={false} maxFontSizeMultiplier={1} accessibilityRole="alert" style={styles.error}>We couldn’t save your profile. Please try again.</Text> : null}
      {lookupFailed ? <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.body}>Your profile is temporarily unavailable. You can still continue or skip.</Text> : null}
      <GlassActionPill label={saving ? "Saving…" : "Continue"} onPress={onContinue} tone="dark" disabled={saving || !fields.name.trim()} />
      <GlassActionPill label="Skip for now" onPress={onSkip} disabled={saving} />
    </View>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: uiPalette.backgroundAlt }, scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 }, title: { fontSize: 28, lineHeight: 34, fontWeight: "700", color: uiPalette.text },
  body: { marginTop: 12, color: uiPalette.textSecondary, fontSize: 16, lineHeight: 23 },
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 12 }, error: { color: uiPalette.danger, fontSize: 15, lineHeight: 21 }
});
