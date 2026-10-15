import { Pressable, StyleSheet, Text, View } from "react-native";
import { uiPalette, uiTypography } from "../ui/system";

export function SettingsInfoRow({ label, value, isLast = false }: { label: string; value: string; isLast?: boolean }) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionRowInner}>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionRowLabel}>
          {label}
        </Text>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionRowValue}>
          {value}
        </Text>
      </View>
      {isLast ? null : <View style={styles.sectionRowDivider} />}
    </View>
  );
}

export function SettingsActionRow({
  label,
  onPress,
  disabled = false,
  isLast = false,
  tone = "default"
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  isLast?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.sectionRow, pressed && !disabled ? styles.sectionRowPressed : null]}
    >
      <View style={styles.sectionRowInner}>
        <Text
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          style={[
            styles.sectionRowLabel,
            tone === "danger" ? styles.sectionRowLabelDanger : null,
            disabled ? styles.sectionRowLabelDisabled : null
          ]}
        >
          {label}
        </Text>
      </View>
      {isLast ? null : <View style={styles.sectionRowDivider} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionRow: {
    minHeight: 68
  },
  sectionRowPressed: {
    opacity: 0.72
  },
  sectionRowInner: {
    minHeight: 68,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  sectionRowDivider: {
    marginHorizontal: 12,
    height: 1,
    backgroundColor: uiPalette.border
  },
  sectionRowLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  },
  sectionRowLabelDanger: {
    color: uiPalette.danger
  },
  sectionRowLabelDisabled: {
    color: uiPalette.textMuted
  },
  sectionRowValue: {
    flexShrink: 1,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.textSecondary
  }
});
