import { useCallback, useState } from "react";
import { useWindowDimensions } from "react-native";
import { useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTabBarBottomOffset } from "./tabBarMetrics";
import type { PillTabBarProps } from "./pillTabBarShared";

const dragSpringConfig = {
  damping: 22,
  stiffness: 280,
  mass: 0.88
} as const;
const pressSpringConfig = {
  damping: 24,
  stiffness: 220,
  mass: 0.94
} as const;
export function usePillTabSelection({
  state,
  emitter,
  navigateToTab
}: Pick<PillTabBarProps, "state" | "emitter" | "navigateToTab">) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tabRowWidth, setTabRowWidth] = useState(0);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);
  const indicatorTranslateX = useSharedValue(0);
  const dragStartX = useSharedValue(0);
  const previewIndex = useSharedValue(state.index);

  const routeCount = Math.max(state.routes.length, 1);
  const selectorInset = 3;
  const innerWidth = Math.max(tabRowWidth - selectorInset * 2, 0);
  const slotWidth = innerWidth / routeCount;
  const indicatorWidth = Math.max(slotWidth, 0);
  const dockWidth = Math.min(width - 36, 492);
  const dockLeft = Math.max((width - dockWidth) / 2, 18);
  const dockBottom = getTabBarBottomOffset(insets.bottom > 0);
  const activeIndex = dragTargetIndex ?? state.index;

  const getTranslateXForIndex = useCallback(
    (index: number) => {
      "worklet";
      return selectorInset + index * slotWidth;
    },
    [slotWidth]
  );
  const maxTranslateX = getTranslateXForIndex(Math.max(routeCount - 1, 0));
  const clampTranslateX = (value: number) => {
    "worklet";
    return Math.min(maxTranslateX, Math.max(selectorInset, value));
  };
  const getIndexForTranslateX = (value: number) => {
    "worklet";
    if (slotWidth <= 0) return state.index;

    return Math.min(routeCount - 1, Math.max(0, Math.round((value - selectorInset) / slotWidth)));
  };
  const setPreviewIndex = useCallback((nextIndex: number | null) => {
    setDragTargetIndex((current) => (current === nextIndex ? current : nextIndex));
  }, []);
  const syncIndicatorToIndex = useCallback(
    (index: number, config = pressSpringConfig) => {
      if (slotWidth <= 0) return;

      previewIndex.value = index;
      indicatorTranslateX.value = withSpring(getTranslateXForIndex(index), config);
    },
    [getTranslateXForIndex, indicatorTranslateX, previewIndex, slotWidth]
  );
  const navigateToIndex = (nextIndex: number) => {
    const route = state.routes[nextIndex];
    if (!route || nextIndex === state.index) return;

    const event = emitter.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true
    });

    if (!event.defaultPrevented) {
      navigateToTab(route.key);
    } else {
      setPreviewIndex(null);
      syncIndicatorToIndex(state.index);
    }
  };
  return {
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
  };
}
