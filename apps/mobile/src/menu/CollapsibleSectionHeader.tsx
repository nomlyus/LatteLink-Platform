import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { SectionHeader } from "../components";
import { uiPalette } from "../ui/system";

export function CollapsibleSectionHeader({
  label,
  collapsed,
  onPress
}: {
  label: string;
  collapsed: boolean;
  onPress: () => void;
}) {
  const rotation = useSharedValue(collapsed ? 1 : 0);
  useEffect(() => {
    rotation.value = withTiming(collapsed ? 1 : 0, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [collapsed, rotation]);
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotation.value, [0, 1], [0, 180])}deg` }]
  }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Toggle ${label}`}
      onPress={onPress}
      style={styles.sectionStickyHeader}
    >
      <View style={styles.sectionHeader}>
        <SectionHeader
          label={label}
          action={
            <Animated.View style={chevronStyle}>
              <Ionicons name="chevron-up-outline" size={16} color={uiPalette.textMuted} />
            </Animated.View>
          }
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionStickyHeader: {
    marginTop: 14
  },
  sectionHeader: {
    backgroundColor: uiPalette.background,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  }
});
