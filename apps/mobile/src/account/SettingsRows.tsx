import { SymbolView } from "expo-symbols";
import { AccountSymbol, type AccountSymbolName } from "./AccountSymbol";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { uiPalette, uiTypography } from "../ui/system";

type SettingsIcon = AccountSymbolName;

export function SettingsInfoRow({ label, value, icon, isLast = false }: { label: string; value: string; icon: SettingsIcon; isLast?: boolean }) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionRowInner}>
        <AccountSymbol name={icon} color={uiPalette.textSecondary} />
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
  icon,
  onPress,
  disabled = false,
  isLast = false,
  tone = "default",
  disclosure = true
}: {
  label: string;
  icon: SettingsIcon;
  onPress: () => void;
  disabled?: boolean;
  isLast?: boolean;
  tone?: "default" | "danger";
  disclosure?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.sectionRow, pressed && !disabled ? styles.sectionRowPressed : null, disabled ? styles.sectionRowDisabled : null]}
    >
      <View style={styles.sectionRowInner}>
        <AccountSymbol name={icon} color={tone === "danger" ? uiPalette.danger : uiPalette.textSecondary} />
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
        {disclosure ? <SymbolView name={{ ios: "chevron.right", android: "chevron_right" }} size={16} tintColor={uiPalette.textSecondary} accessible={false} /> : null}
      </View>
      {isLast ? null : <View style={styles.sectionRowDivider} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionRow: {
    minHeight: 64
  },
  sectionRowPressed: {
    opacity: 0.72
  },
  sectionRowDisabled: {
    opacity: 0.5
  },
  sectionRowInner: {
    minHeight: 64,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14
  },
  sectionRowDivider: {
    marginLeft: 58,
    marginRight: 20,
    height: StyleSheet.hairlineWidth,
    backgroundColor: uiPalette.border
  },
  sectionRowLabel: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
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
    flex: 1,
    flexShrink: 1,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.textSecondary
  }
});
