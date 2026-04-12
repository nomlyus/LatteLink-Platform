import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type { MenuItemCustomizationGroup, MenuItemCustomizationOption } from "@lattelink/contracts-catalog";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { type CartCustomization, isCustomizationOptionSelected } from "../cart/model";
import { uiPalette, uiTypography } from "../ui/system";
import { formatUsd } from "./catalog";

function canUseLiquidGlassCustomization() {
  if (Platform.OS !== "ios") return false;

  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

function getSelectionHint(group: MenuItemCustomizationGroup) {
  if (group.selectionType === "single") {
    return group.required ? "Pick 1" : "Optional";
  }

  if (group.minSelections > 0 && group.maxSelections === group.minSelections) {
    return `Pick ${group.minSelections}`;
  }

  if (group.minSelections > 0) {
    return `Pick ${group.minSelections}-${group.maxSelections}`;
  }

  return `Pick up to ${group.maxSelections}`;
}

function getOptionMeta(option: MenuItemCustomizationOption) {
  if (option.priceDeltaCents > 0) {
    return `+${formatUsd(option.priceDeltaCents)}`;
  }

  if (option.default) {
    return "";
  }

  return "Included";
}

function compareOptions(left: MenuItemCustomizationOption, right: MenuItemCustomizationOption) {
  if (left.default !== right.default) {
    return left.default ? -1 : 1;
  }

  return left.sortOrder - right.sortOrder || left.label.localeCompare(right.label) || left.id.localeCompare(right.id);
}

type OptionRowProps = {
  option: MenuItemCustomizationOption;
  active: boolean;
  onPress: () => void;
};

function OptionRow({ option, active, onPress }: OptionRowProps) {
  const meta = getOptionMeta(option);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        active ? styles.optionRowActive : null,
        pressed ? styles.optionRowPressed : null
      ]}
    >
      <View style={styles.optionLeading}>
        <View style={[styles.optionSelectionControl, active ? styles.optionSelectionControlActive : null]}>
          {active ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
        </View>

        <View style={styles.optionTitleRow}>
          <Text style={[styles.optionLabel, active ? styles.optionLabelActive : null]} numberOfLines={1}>
            {option.label}
          </Text>
          {meta ? <Text style={[styles.optionMetaInline, active ? styles.optionMetaActive : null]}>{meta}</Text> : null}
          {option.default ? (
            <View style={[styles.optionBadge, active ? styles.optionBadgeActive : null]}>
              <Text style={[styles.optionBadgeText, active ? styles.optionBadgeTextActive : null]}>Default</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

type CustomizationGroupSectionProps = {
  group: MenuItemCustomizationGroup;
  customization: CartCustomization;
  validationMessage?: string;
  onSelectOption: (option: MenuItemCustomizationOption) => void;
};

export function CustomizationGroupSection({
  group,
  customization,
  validationMessage,
  onSelectOption
}: CustomizationGroupSectionProps) {
  const useLiquidGlass = canUseLiquidGlassCustomization();
  const selectedCount = customization.selectedOptions.filter((selection) => selection.groupId === group.id).length;

  return (
    <View style={styles.sectionShell}>
      {useLiquidGlass ? (
        <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.sectionFrame}>
          <View style={styles.sectionGlassInner} />
        </GlassView>
      ) : (
        <BlurView tint="light" intensity={Platform.OS === "ios" ? 26 : 22} style={styles.sectionFrame}>
          <View style={styles.sectionFallbackInner} />
        </BlurView>
      )}

      <View style={styles.sectionContent}>
        <View style={styles.headerPillsRow}>
          <View style={styles.headerPrimaryPill}>
            <Text style={styles.headerPrimaryPillText}>{getSelectionHint(group)}</Text>
          </View>
          <View style={styles.headerSecondaryPill}>
            <Text style={styles.headerSecondaryPillText}>
              {group.required ? "Required" : "Optional"}{group.maxSelections > 1 ? ` • ${selectedCount}/${group.maxSelections}` : ""}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{group.label}</Text>
        {group.description ? <Text style={styles.sectionBody}>{group.description}</Text> : null}

        <View style={styles.optionsStack}>
          {group.options
            .filter((option) => option.available)
            .sort(compareOptions)
            .map((option) => (
              <OptionRow
                key={option.id}
                option={option}
                active={isCustomizationOptionSelected(customization, group.id, option.id)}
                onPress={() => onSelectOption(option)}
              />
            ))}
        </View>

        {validationMessage ? <Text style={styles.sectionError}>{validationMessage}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionShell: {
    marginTop: 18,
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3
  },
  sectionFrame: {
    ...StyleSheet.absoluteFillObject
  },
  sectionGlassInner: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: "rgba(255, 252, 246, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)"
  },
  sectionFallbackInner: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: "rgba(255, 252, 246, 0.62)",
    borderWidth: 1,
    borderColor: "rgba(23, 21, 19, 0.06)"
  },
  sectionContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18
  },
  headerPillsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  headerPrimaryPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.56)",
    borderWidth: 1,
    borderColor: "rgba(23, 21, 19, 0.06)"
  },
  headerPrimaryPillText: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontWeight: "600"
  },
  headerSecondaryPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.32)",
    borderWidth: 1,
    borderColor: "rgba(23, 21, 19, 0.05)"
  },
  headerSecondaryPillText: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: uiPalette.textSecondary,
    fontWeight: "500"
  },
  sectionTitle: {
    marginTop: 14,
    fontSize: 20,
    lineHeight: 24,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  },
  sectionBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: uiPalette.textSecondary
  },
  optionsStack: {
    marginTop: 16,
    gap: 8
  },
  optionRow: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.46)",
    borderWidth: 1,
    borderColor: "rgba(23, 21, 19, 0.06)"
  },
  optionRowActive: {
    backgroundColor: "rgba(255,255,255,0.82)",
    borderColor: "rgba(23, 21, 19, 0.10)"
  },
  optionRowPressed: {
    opacity: 0.92
  },
  optionLeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  optionSelectionControl: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(23, 21, 19, 0.16)",
    backgroundColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center"
  },
  optionSelectionControlActive: {
    borderColor: uiPalette.text,
    backgroundColor: uiPalette.text
  },
  optionTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8
  },
  optionLabel: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    color: uiPalette.text,
    fontWeight: "600"
  },
  optionLabelActive: {
    color: uiPalette.text
  },
  optionBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(23, 21, 19, 0.05)"
  },
  optionBadgeActive: {
    backgroundColor: "rgba(23, 21, 19, 0.08)"
  },
  optionBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: uiPalette.textSecondary,
    fontWeight: "600"
  },
  optionBadgeTextActive: {
    color: uiPalette.text
  },
  optionMetaInline: {
    fontSize: 12,
    lineHeight: 16,
    color: uiPalette.textSecondary,
    fontWeight: "400"
  },
  optionMetaActive: {
    color: uiPalette.text
  },
  sectionError: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
    color: "#A55B3F"
  }
});
