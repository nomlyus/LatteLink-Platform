import { usePillTabSelection } from "./usePillTabSelection";
import { GlassView } from "expo-glass-effect";
import { useEffect } from "react";

import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { TAB_BAR_HEIGHT } from "./tabBarMetrics";
import type { PillTabBarProps } from "./pillTabBarShared";
import { PillTabButtons, PillTabIcons } from "./PillTabItems";
import { TabBarCartButton } from "./TabBarCartButton";

export function LiquidGlassPillTabBar({ state, descriptors, emitter, navigateToTab }: PillTabBarProps) {
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
  const dragMorphProgress = useSharedValue(0);
  const dragVelocityInfluence = useSharedValue(0);
  const indicatorBaseTop = 3;
  const indicatorBaseHeight = 56;
  const indicatorStyle = useAnimatedStyle(() => {
    const velocity = Math.max(-1, Math.min(1, dragVelocityInfluence.value));
    const speed = Math.abs(velocity);
    const dragAmount = dragMorphProgress.value;
    const extraWidth = dragAmount * 12 + speed * 12;
    const extraHeight = dragAmount * 14 + speed * 10;
    const top = indicatorBaseTop - extraHeight / 2;
    const height = indicatorBaseHeight + extraHeight;

    return {
      top,
      height,
      width: indicatorWidth + extraWidth * 2,
      transform: [{ translateX: indicatorTranslateX.value - extraWidth }]
    };
  }, [indicatorWidth]);
  const dragHandleStyle = useAnimatedStyle(
    () => ({
      width: indicatorWidth,
      transform: [{ translateX: indicatorTranslateX.value }]
    }),
    [indicatorWidth]
  );
  const activeIconWindowStyle = useAnimatedStyle(() => {
    const velocity = Math.max(-1, Math.min(1, dragVelocityInfluence.value));
    const speed = Math.abs(velocity);
    const dragAmount = dragMorphProgress.value;
    const extraWidth = dragAmount * 12 + speed * 12;

    return {
      top: indicatorBaseTop,
      height: indicatorBaseHeight,
      width: indicatorWidth + extraWidth * 2,
      transform: [{ translateX: indicatorTranslateX.value - extraWidth }]
    };
  }, [indicatorWidth]);
  const activeIconTrackStyle = useAnimatedStyle(() => {
    const velocity = Math.max(-1, Math.min(1, dragVelocityInfluence.value));
    const speed = Math.abs(velocity);
    const dragAmount = dragMorphProgress.value;
    const extraWidth = dragAmount * 12 + speed * 12;

    return {
      width: tabRowWidth,
      transform: [{ translateX: -indicatorTranslateX.value + extraWidth }]
    };
  }, [tabRowWidth]);
  const dockMotionStyle = useAnimatedStyle(() => {
    if (tabRowWidth <= 0) {
      return {
        transform: [{ translateX: 0 }, { translateY: 0 }, { scaleX: 1 }, { scaleY: 1 }]
      };
    }

    const selectorCenter = indicatorTranslateX.value + indicatorWidth / 2;
    const dockCenter = tabRowWidth / 2;
    const normalized = Math.max(-1, Math.min(1, (selectorCenter - dockCenter) / Math.max(dockCenter, 1)));
    const dragAmount = dragMorphProgress.value;

    return {
      transform: [
        { translateX: normalized * 1.1 * dragAmount },
        { translateY: -1.25 * dragAmount },
        { scaleX: 1 + 0.012 * dragAmount },
        { scaleY: 1 - 0.018 * dragAmount }
      ]
    };
  }, [indicatorWidth, tabRowWidth]);

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
    .onTouchesDown(() => {
      previewIndex.value = state.index;
      dragVelocityInfluence.value = 0;
      dragMorphProgress.value = withSpring(1, {
        damping: 20,
        stiffness: 260,
        mass: 0.8
      });
    })
    .onTouchesUp(() => {
      dragVelocityInfluence.value = withSpring(0, {
        damping: 18,
        stiffness: 180,
        mass: 0.9
      });
      dragMorphProgress.value = withSpring(0, {
        damping: 24,
        stiffness: 220,
        mass: 0.9
      });
    })
    .onTouchesCancelled(() => {
      dragVelocityInfluence.value = withSpring(0, {
        damping: 18,
        stiffness: 180,
        mass: 0.9
      });
      dragMorphProgress.value = withSpring(0, {
        damping: 24,
        stiffness: 220,
        mass: 0.9
      });
    })
    .onStart(() => {
      dragStartX.value = indicatorTranslateX.value;
      previewIndex.value = state.index;
    })
    .onUpdate((event) => {
      const nextX = clampTranslateX(dragStartX.value + event.translationX);
      const nextIndex = getIndexForTranslateX(nextX);

      indicatorTranslateX.value = nextX;
      dragVelocityInfluence.value = Math.max(-1, Math.min(1, event.velocityX / 1400));
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
      dragVelocityInfluence.value = withSpring(0, {
        damping: 18,
        stiffness: 180,
        mass: 0.9
      });
      dragMorphProgress.value = withSpring(0, {
        damping: 24,
        stiffness: 220,
        mass: 0.9
      });
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
      dragVelocityInfluence.value = withSpring(0, {
        damping: 18,
        stiffness: 180,
        mass: 0.9
      });
      dragMorphProgress.value = withSpring(0, {
        damping: 24,
        stiffness: 220,
        mass: 0.9
      });
    });

  return (
    <View pointerEvents="box-none" style={[styles.shell, { left: dockLeft, bottom: dockBottom, width: dockWidth }]}>
      <View style={styles.row}>
        <View style={styles.dockWrap}>
          <Animated.View style={[styles.container, styles.containerGlass, dockMotionStyle]}>
            <View
              style={styles.tabRow}
              onLayout={(event) => {
                setTabRowWidth(event.nativeEvent.layout.width);
              }}
            >
              <View pointerEvents="none" style={styles.glassMergeLayer}>
                <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.glassBase}>
                  <View style={styles.dockInnerGlass} />
                </GlassView>
                {indicatorWidth > 0 ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.activeIndicator, styles.activeIndicatorGlassShell, indicatorStyle]}
                  >
                    <GlassView
                      glassEffectStyle="regular"
                      colorScheme="auto"
                      isInteractive
                      style={styles.activeIndicatorGlassView}
                    >
                      <View style={styles.activeIndicatorGlassPill} />
                    </GlassView>
                  </Animated.View>
                ) : null}
              </View>

              <View pointerEvents="none" style={styles.baseIconRow}>
                <PillTabIcons state={state} descriptors={descriptors} active={false} variant="glass" />
              </View>
              {indicatorWidth > 0 ? (
                <Animated.View pointerEvents="none" style={[styles.activeIconWindow, activeIconWindowStyle]}>
                  <Animated.View style={[styles.activeIconTrack, activeIconTrackStyle]}>
                    <PillTabIcons state={state} descriptors={descriptors} active variant="glass" />
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
          </Animated.View>
        </View>

        <TabBarCartButton variant="glass" />
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
  containerGlass: {
    shadowOpacity: 0.025,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  glassMergeLayer: {
    ...StyleSheet.absoluteFill
  },
  glassBase: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
    overflow: "hidden"
  },
  dockInnerGlass: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.003)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.11)"
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
    borderRadius: 999
  },
  activeIndicatorGlassShell: {
    shadowColor: "#000000",
    shadowOpacity: 0.02,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    overflow: "visible"
  },
  activeIndicatorGlassView: {
    flex: 1,
    borderRadius: 999,
    overflow: "hidden"
  },
  activeIndicatorGlassPill: {
    flex: 1,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    backgroundColor: "transparent"
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
