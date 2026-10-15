import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenBackdrop, TabBarDepthBackdrop, uiPalette, uiTypography } from "../ui/system";
import { SectionHeader } from "../components";

function LoadingBlock({
  width = "100%",
  height,
  radius = 12
}: {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
}) {
  return (
    <View
      style={[
        styles.loadingBlock,
        {
          width,
          height,
          borderRadius: radius
        }
      ]}
    />
  );
}

function LoadingMenuRow() {
  return (
    <View style={styles.menuRow}>
      <View style={styles.menuRowMain}>
        <View style={styles.menuImage} />
        <View style={[styles.menuBodyWrap, styles.menuBodyWrapWithDivider]}>
          <View style={styles.menuBodyContent}>
            <View style={styles.menuCopy}>
              <View style={styles.menuTitleRow}>
                <LoadingBlock width="48%" height={18} radius={9} />
                <LoadingBlock width={56} height={18} radius={9} />
              </View>
              <LoadingBlock width="82%" height={12} radius={6} />
              <LoadingBlock width="58%" height={12} radius={6} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

export function LoadingMenuState({
  headerExpandedHeight,
  contentBottomInset,
  insets
}: {
  headerExpandedHeight: number;
  contentBottomInset: number;
  insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 820, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.56, 1])
  }));

  return (
    <View style={styles.screen}>
      <ScreenBackdrop />

      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerExpandedHeight,
            paddingBottom: contentBottomInset
          }
        ]}
      >
        <Animated.View style={pulseStyle}>
          <View style={styles.sectionStickyHeader}>
            <View style={styles.sectionHeader}>
              <SectionHeader
                label="Featured"
                action={<Ionicons name="chevron-up-outline" size={16} color={uiPalette.textMuted} />}
              />
            </View>
          </View>
          <View style={styles.sectionListBlock}>
            <View style={styles.sectionList}>
              <LoadingMenuRow />
              <LoadingMenuRow />
              <LoadingMenuRow />
            </View>
          </View>

          <View style={styles.sectionStickyHeader}>
            <View style={styles.sectionHeader}>
              <SectionHeader
                label="Menu"
                action={<Ionicons name="chevron-up-outline" size={16} color={uiPalette.textMuted} />}
              />
            </View>
          </View>
          <View style={styles.sectionListBlock}>
            <View style={styles.sectionList}>
              <LoadingMenuRow />
              <LoadingMenuRow />
            </View>
          </View>
        </Animated.View>
      </ScrollView>

      <View style={[styles.headerShell, { paddingTop: insets.top, height: headerExpandedHeight }]}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <View style={[styles.pickupMetaWrap, styles.loadingPickupMetaWrap]}>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.pickupMeta}>
                Loading pickup estimate
              </Text>
            </View>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.locationText}>
              Loading location
            </Text>
          </View>
        </View>

        <View style={[styles.tabsWrap, styles.loadingTabsWrap]}>
          <View style={styles.tabRow}>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.activeTab}>
              Menu
            </Text>
          </View>
        </View>
      </View>

      <TabBarDepthBackdrop />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: uiPalette.background
  },
  scrollContent: {
    paddingHorizontal: 20
  },
  headerShell: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 20,
    backgroundColor: uiPalette.background,
    overflow: "hidden",
    justifyContent: "flex-end"
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16
  },
  headerCopy: {
    flex: 1
  },
  pickupMetaWrap: {
    overflow: "hidden"
  },
  loadingPickupMetaWrap: {
    height: 18,
    marginBottom: 6
  },
  pickupMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: uiPalette.textSecondary
  },
  locationText: {
    marginTop: 3,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.headerFamily,
    fontWeight: "600"
  },
  tabsWrap: {
    overflow: "hidden"
  },
  loadingTabsWrap: {
    height: 34,
    marginTop: 9
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  activeTab: {
    fontSize: 28,
    lineHeight: 32,
    color: uiPalette.text,
    fontFamily: uiTypography.headerFamily,
    fontWeight: "600"
  },
  sectionStickyHeader: {
    marginTop: 14
  },
  sectionListBlock: {
    marginTop: 0
  },
  sectionHeader: {
    backgroundColor: uiPalette.background,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  sectionList: {
    borderTopWidth: 1,
    borderTopColor: uiPalette.border
  },
  menuRow: {
    minHeight: 132
  },
  menuRowMain: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    width: "100%"
  },
  menuImage: {
    width: 108,
    height: 132,
    backgroundColor: "#D5D4CE",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  menuBodyWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: 132,
    paddingTop: 0,
    paddingBottom: 0,
    justifyContent: "center"
  },
  menuBodyWrapWithDivider: {
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border
  },
  menuBodyContent: {
    minHeight: 132,
    justifyContent: "center",
    paddingVertical: 10
  },
  menuCopy: {
    justifyContent: "center",
    gap: 1
  },
  menuTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  loadingBlock: {
    backgroundColor: "rgba(219, 216, 207, 0.92)"
  }
});
