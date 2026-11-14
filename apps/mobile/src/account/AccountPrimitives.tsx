import { SymbolView } from "expo-symbols";
import { AccountSymbol, type AccountSymbolName } from "./AccountSymbol";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { uiPalette, uiTypography } from "../ui/system";

export function AccountPageRow({
  label,
  icon,
  isLast = false,
  onPress
}: {
  label: string;
  icon: AccountSymbolName;
  isLast?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.pageRow, pressed ? styles.pageRowPressed : null]}
    >
      <View style={styles.pageRowInner}>
        <AccountSymbol name={icon} color={uiPalette.textSecondary} />
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} numberOfLines={1} style={styles.pageRowLabel}>
          {label}
        </Text>
        <SymbolView name={{ ios: "chevron.right", android: "chevron_right" }} size={16} tintColor={uiPalette.textSecondary} accessible={false} style={styles.pageRowChevron} />
      </View>
      {isLast ? null : <View style={styles.pageRowDivider} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pageRow: {
    minHeight: 64
  },
  pageRowPressed: {
    opacity: 0.72
  },
  pageRowInner: {
    minHeight: 64,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14
  },
  pageRowLabel: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  },
  pageRowChevron: {
    flexShrink: 0
  },
  pageRowDivider: {
    marginLeft: 58,
    marginRight: 20,
    height: StyleSheet.hairlineWidth,
    backgroundColor: uiPalette.border
  }
});
