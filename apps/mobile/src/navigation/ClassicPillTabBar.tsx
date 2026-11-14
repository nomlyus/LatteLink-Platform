import { usePillTabSelection } from "./usePillTabSelection";
import { BlurView } from "expo-blur";
import { useEffect, type ReactNode } from "react";

import { Platform, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, withSpring } from "react-native-reanimated";

import { TAB_BAR_HEIGHT } from "./tabBarMetrics";
import type { PillTabBarProps } from "./pillTabBarShared";
import { PillTabButtons, PillTabIcons } from "./PillTabItems";
import { TabBarCartButton } from "./TabBarCartButton";
import { uiPalette } from "../ui/systemColors";

function renderDockSurface(children: ReactNode) {
  const chrome = <View style={styles.dockInner}>{children}</View>;

  return (
    <BlurView tint="systemMaterial" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.blurShell}>
      {chrome}
    </BlurView>
  );
}

export function ClassicPillTabBar({ state, descriptors, emitter, navigateToTab }: PillTabBarProps) {
  const {
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
  } = usePillTabSelection({ state, emitter, navigateToTab });
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
                  <PillTabIcons state={state} descriptors={descriptors} active={false} variant="classic" />
                </View>
                {indicatorWidth > 0 ? (
                  <Animated.View pointerEvents="none" style={[styles.activeIndicator, indicatorStyle]} />
                ) : null}
                {indicatorWidth > 0 ? (
                  <Animated.View pointerEvents="none" style={[styles.activeIconWindow, indicatorStyle]}>
                    <Animated.View style={[styles.activeIconTrack, activeIconTrackStyle]}>
                      <PillTabIcons state={state} descriptors={descriptors} active variant="classic" />
                    </Animated.View>
                  </Animated.View>
                ) : null}
                {indicatorWidth > 0 ? (
                  <GestureDetector gesture={selectorGesture}>
                    <Animated.View style={[styles.dragHandle, dragHandleStyle]} />
                  </GestureDetector>
                ) : null}

                <PillTabButtons
                  state={state}
                  descriptors={descriptors}
                  emitter={emitter}
                  navigateToTab={navigateToTab}
                  activeIndex={activeIndex}
                />
              </View>
            )}
          </View>
        </View>

        <TabBarCartButton variant="classic" />
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
    backgroundColor: uiPalette.surfaceStrong,
    borderWidth: 1,
    borderColor: uiPalette.border
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
    borderColor: uiPalette.border,
    backgroundColor: uiPalette.card,
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
  }
});
