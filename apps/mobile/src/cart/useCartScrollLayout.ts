import { useHeaderHeight } from "expo-router/react-navigation";
import { useCallback, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cartContentMinimumHeight } from "./scrollLayout";

export function useCartScrollLayout(registerScrollEdge: (event: LayoutChangeEvent) => void) {
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    registerScrollEdge(event);
    setViewportHeight(event.nativeEvent.layout.height);
    setContentWidth(event.nativeEvent.layout.width);
  }, [registerScrollEdge]);

  return {
    onLayout,
    contentWidth,
    minimumHeight: cartContentMinimumHeight(viewportHeight, headerHeight, insets)
  };
}
