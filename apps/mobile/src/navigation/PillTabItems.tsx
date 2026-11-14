import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { uiTypography } from "../ui/system";
import { getBottomTabPresentation } from "./bottomTabs";
import { uiPalette } from "../ui/systemColors";
import type { PillTabBarProps, PillTabBarVariant } from "./pillTabBarShared";

type TabItemsProps = Pick<PillTabBarProps, "state" | "descriptors">;

export function PillTabIcons({
  state,
  descriptors,
  active,
  variant
}: TabItemsProps & {
  active: boolean;
  variant: PillTabBarVariant;
}) {
  const activeColor = uiPalette.chromeText;
  const inactiveColor = uiPalette.chromeMuted;
  return (
    <>
      {state.routes.map((route) => {
        const { label, icons, iconSize } = getBottomTabPresentation(route.name, descriptors[route.key].options.title);
        return (
          <View key={`${active ? "active" : "base"}-${route.key}`} style={styles.tabSlot}>
            <View pointerEvents="none" style={styles.tabButton}>
              <View style={styles.tabContent}>
                <View style={styles.tabIconBox}>
                  <Ionicons
                    name={active ? icons.active : icons.default}
                    size={iconSize}
                    color={active ? activeColor : inactiveColor}
                  />
                </View>
                <Text
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1}
                  numberOfLines={1}
                  style={[
                    styles.tabLabel,
                    variant === "glass" ? styles.tabLabelGlass : null,
                    active ? styles.tabLabelActive : null
                  ]}
                >
                  {label}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </>
  );
}

export function PillTabButtons({
  state,
  descriptors,
  emitter,
  navigateToTab,
  activeIndex
}: TabItemsProps & Pick<PillTabBarProps, "emitter" | "navigateToTab"> & { activeIndex: number }) {
  return (
    <>
      {state.routes.map((route, index) => {
        const { label } = getBottomTabPresentation(route.name, descriptors[route.key].options.title);
        const isFocused = activeIndex === index;
        const onPress = () => {
          const event = emitter.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true
          });
          if (!isFocused && !event.defaultPrevented) navigateToTab(route.key);
        };
        return (
          <View key={route.key} style={styles.tabSlot}>
            <Pressable
              onPress={onPress}
              style={({ pressed }) => [styles.tabButton, pressed ? styles.tabPressed : null]}
              hitSlop={{ top: 2, bottom: 2, left: 14, right: 14 }}
              accessibilityRole="tab"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={descriptors[route.key].options.tabBarAccessibilityLabel ?? label}
            >
              <View style={styles.tabContent}>
                <View style={styles.tabIconBox} />
                <Text
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1}
                  numberOfLines={1}
                  style={[styles.tabLabel, styles.tabLabelPlaceholder]}
                >
                  {label}
                </Text>
              </View>
            </Pressable>
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  tabSlot: {
    flex: 1,
    zIndex: 3,
    alignItems: "stretch",
    justifyContent: "center"
  },
  tabButton: {
    width: "100%",
    minHeight: 58,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  tabContent: { width: "100%", alignItems: "center", justifyContent: "center" },
  tabIconBox: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center"
  },
  tabPressed: { opacity: 0.78 },
  tabLabel: {
    width: "100%",
    marginTop: 0,
    fontSize: 12,
    lineHeight: 14,
    color: uiPalette.chromeMuted,
    fontWeight: "500",
    letterSpacing: 0.1,
    textAlign: "center",
    fontFamily: uiTypography.bodyFamily
  },
  tabLabelGlass: { color: uiPalette.chromeMuted },
  tabLabelPlaceholder: { opacity: 0 },
  tabLabelActive: { color: uiPalette.chromeText }
});
