import { usePillTabSelection } from "./usePillTabSelection";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useEffect, type ReactNode } from "react";

import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, withSpring } from "react-native-reanimated";

import { uiPalette, uiTypography } from "../ui/system";
import { TAB_BAR_HEIGHT } from "./tabBarMetrics";
import { iconMap, iconSizeMap, labelMap, type PillTabBarProps } from "./pillTabBarShared";

function renderDockSurface(children: ReactNode) {
  const chrome = <View style={styles.dockInner}>{children}</View>;

  return (
    <BlurView tint="light" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.blurShell}>
      {chrome}
    </BlurView>
  );
}

export function ClassicPillTabBar({ state, descriptors, navigation }: PillTabBarProps) {
  const {
    router,
    itemCount,
    tabRowWidth,
    setTabRowWidth,
    indicatorTranslateX,
    dragStartX,
    previewIndex,
    slotWidth,
    indicatorWidth,
    dockWidth,
    dockLeft,
    dockBottom,
    activeIndex,
    getTranslateXForIndex,
    clampTranslateX,
    getIndexForTranslateX,
    setPreviewIndex,
    syncIndicatorToIndex,
    navigateToIndex,
    dragSpringConfig
  } = usePillTabSelection({ state, navigation });
  const indicatorStyle = useAnimatedStyle(
    () => ({
      width: indicatorWidth,
      transform: [{ translateX: indicatorTranslateX.value }]
    }),
    [indicatorWidth]
  );
  const dragHandleStyle = useAnimatedStyle(
    () => ({
      width: indicatorWidth,
      transform: [{ translateX: indicatorTranslateX.value }]
    }),
    [indicatorWidth]
  );
  const activeIconTrackStyle = useAnimatedStyle(
    () => ({
      width: tabRowWidth,
      transform: [{ translateX: -indicatorTranslateX.value }]
    }),
    [tabRowWidth]
  );

  const renderIconSlots = (useActiveIcons: boolean) =>
    state.routes.map((route) => {
      const descriptor = descriptors[route.key];
      const label =
        typeof descriptor.options.title === "string" ? descriptor.options.title : (labelMap[route.name] ?? route.name);
      const iconNames = iconMap[route.name] ?? { default: "ellipse-outline", active: "ellipse" };
      const iconSize = iconSizeMap[route.name] ?? 24;

      return (
        <View key={`${useActiveIcons ? "active" : "base"}-${route.key}`} style={styles.tabSlot}>
          <View pointerEvents="none" style={styles.tabVisualButton}>
            <View style={styles.tabContent}>
              <View style={styles.tabIconBox}>
                <Ionicons
                  name={useActiveIcons ? iconNames.active : iconNames.default}
                  size={iconSize}
                  color={useActiveIcons ? "rgba(18, 18, 18, 0.96)" : "rgba(60, 60, 67, 0.72)"}
                />
              </View>
              <Text
                allowFontScaling={false}
                maxFontSizeMultiplier={1}
                numberOfLines={1}
                style={[styles.tabLabel, useActiveIcons ? styles.tabLabelActive : null]}
              >
                {label}
              </Text>
            </View>
          </View>
        </View>
      );
    });

  useEffect(() => {
    if (slotWidth <= 0) return;

    setPreviewIndex(null);
    syncIndicatorToIndex(state.index);
  }, [setPreviewIndex, slotWidth, state.index, syncIndicatorToIndex]);

  const selectorGesture = Gesture.Pan()
    .enabled(slotWidth > 0)
    .maxPointers(1)
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      dragStartX.value = indicatorTranslateX.value;
      previewIndex.value = state.index;
    })
    .onUpdate((event) => {
      const nextX = clampTranslateX(dragStartX.value + event.translationX);
      const nextIndex = getIndexForTranslateX(nextX);

      indicatorTranslateX.value = nextX;
      if (previewIndex.value !== nextIndex) {
        previewIndex.value = nextIndex;
        runOnJS(setPreviewIndex)(nextIndex);
      }
    })
    .onEnd((event) => {
      const projectedX = clampTranslateX(indicatorTranslateX.value + event.velocityX * 0.06);
      const nextIndex = getIndexForTranslateX(projectedX);
      const nextX = getTranslateXForIndex(nextIndex);

      previewIndex.value = nextIndex;
      indicatorTranslateX.value = withSpring(nextX, dragSpringConfig);
      runOnJS(setPreviewIndex)(nextIndex);
      if (nextIndex !== state.index) {
        runOnJS(navigateToIndex)(nextIndex);
      } else {
        runOnJS(setPreviewIndex)(null);
      }
    })
    .onFinalize((_event, success) => {
      if (!success) {
        previewIndex.value = state.index;
        indicatorTranslateX.value = withSpring(getTranslateXForIndex(state.index), dragSpringConfig);
        runOnJS(setPreviewIndex)(null);
      }
    });

  return (
    <View pointerEvents="box-none" style={[styles.shell, { left: dockLeft, bottom: dockBottom, width: dockWidth }]}>
      <View style={styles.row}>
        <View style={styles.dockWrap}>
          <View style={styles.container}>
            {renderDockSurface(
              <View
                style={styles.tabRow}
                onLayout={(event) => {
                  setTabRowWidth(event.nativeEvent.layout.width);
                }}
              >
                <View pointerEvents="none" style={styles.baseIconRow}>
                  {renderIconSlots(false)}
                </View>
                {indicatorWidth > 0 ? (
                  <Animated.View pointerEvents="none" style={[styles.activeIndicator, indicatorStyle]} />
                ) : null}
                {indicatorWidth > 0 ? (
                  <Animated.View pointerEvents="none" style={[styles.activeIconWindow, indicatorStyle]}>
                    <Animated.View style={[styles.activeIconTrack, activeIconTrackStyle]}>
                      {renderIconSlots(true)}
                    </Animated.View>
                  </Animated.View>
                ) : null}
                {indicatorWidth > 0 ? (
                  <GestureDetector gesture={selectorGesture}>
                    <Animated.View style={[styles.dragHandle, dragHandleStyle]} />
                  </GestureDetector>
                ) : null}

                {state.routes.map((route, index) => {
                  const descriptor = descriptors[route.key];
                  const isFocused = activeIndex === index;
                  const label =
                    typeof descriptor.options.title === "string"
                      ? descriptor.options.title
                      : (labelMap[route.name] ?? route.name);

                  const onPress = () => {
                    const event = navigation.emit({
                      type: "tabPress",
                      target: route.key,
                      canPreventDefault: true
                    });

                    if (!isFocused && !event.defaultPrevented) {
                      navigation.navigate(route.name, route.params);
                    }
                  };

                  return (
                    <View key={route.key} style={styles.tabSlot}>
                      <Pressable
                        onPress={onPress}
                        style={({ pressed }) => [styles.tabButton, pressed ? styles.tabPressed : null]}
                        hitSlop={{ top: 2, bottom: 2, left: 14, right: 14 }}
                        accessibilityRole="tab"
                        accessibilityState={isFocused ? { selected: true } : {}}
                        accessibilityLabel={descriptor.options.tabBarAccessibilityLabel ?? label}
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
              </View>
            )}
          </View>
        </View>

        {itemCount > 0 ? (
          <Pressable
            accessibilityLabel="Open cart"
            style={styles.cartPillPressable}
            onPress={() => router.push("/cart")}
          >
            <BlurView tint="light" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.cartBlurShell}>
              <View style={styles.cartPillInner}>
                <Ionicons name="bag-handle-outline" size={21} color={uiPalette.text} />
                <View style={styles.cartCountBadge}>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.cartCountLabel}>
                    {itemCount > 99 ? "99+" : String(itemCount)}
                  </Text>
                </View>
              </View>
            </BlurView>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: "absolute",
    overflow: "visible"
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  dockWrap: {
    flex: 1
  },
  cartPillPressable: {
    width: 58,
    minWidth: 58,
    height: 58,
    borderRadius: 999
  },
  cartBlurShell: {
    flex: 1,
    borderRadius: 999,
    overflow: "hidden"
  },
  cartPillInner: {
    flex: 1,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(244, 240, 232, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(236, 228, 216, 0.82)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  },
  cartCountBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(23, 21, 19, 0.92)"
  },
  cartCountLabel: {
    fontSize: 10,
    lineHeight: 10,
    color: "#FFFFFF",
    fontWeight: "700",
    fontFamily: uiTypography.bodyFamily
  },
  container: {
    borderRadius: 999,
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4
  },
  blurShell: {
    borderRadius: 999,
    overflow: "hidden"
  },
  dockInner: {
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(244, 240, 232, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(236, 228, 216, 0.82)"
  },
  tabRow: {
    minHeight: TAB_BAR_HEIGHT,
    paddingHorizontal: 3,
    paddingVertical: 3,
    flexDirection: "row",
    alignItems: "center"
  },
  activeIndicator: {
    position: "absolute",
    top: 3,
    height: 56,
    zIndex: 1,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 251, 244, 0.78)",
    backgroundColor: "rgba(255, 252, 246, 0.84)",
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  baseIconRow: {
    ...StyleSheet.absoluteFill,
    paddingHorizontal: 3,
    paddingVertical: 3,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 0
  },
  activeIconWindow: {
    position: "absolute",
    top: 3,
    height: 56,
    borderRadius: 999,
    overflow: "hidden",
    zIndex: 2
  },
  activeIconTrack: {
    position: "absolute",
    top: -3,
    left: 0,
    height: TAB_BAR_HEIGHT,
    paddingHorizontal: 3,
    paddingVertical: 3,
    flexDirection: "row",
    alignItems: "center"
  },
  dragHandle: {
    position: "absolute",
    top: 3,
    height: 56,
    borderRadius: 999,
    zIndex: 4
  },
  tabSlot: {
    flex: 1,
    zIndex: 3,
    alignItems: "stretch",
    justifyContent: "center"
  },
  tabVisualButton: {
    width: "100%",
    minHeight: 58,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  tabButton: {
    width: "100%",
    minHeight: 58,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  tabContent: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center"
  },
  tabIconBox: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center"
  },
  tabPressed: {
    opacity: 0.78
  },
  tabLabel: {
    width: "100%",
    marginTop: 0,
    fontSize: 12,
    lineHeight: 14,
    color: "rgba(60, 60, 67, 0.72)",
    fontWeight: "500",
    letterSpacing: 0.1,
    textAlign: "center",
    fontFamily: uiTypography.bodyFamily
  },
  tabLabelPlaceholder: {
    opacity: 0
  },
  tabLabelActive: {
    color: "rgba(18, 18, 18, 0.96)"
  }
});
