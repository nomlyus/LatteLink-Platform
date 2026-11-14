import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollViewInstance } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useLocationContext } from "../location/LocationProvider";

/** Native menu actions navigate the existing menu; they never filter or refetch its data. */
export function useMenuCategoryJump(categories: readonly { id: string }[], headerHeight: number, nativeInsets: boolean) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const positions = useRef(new Map<string, number>());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const { brandId, selectedLocationId } = useLocationContext();

  useLayoutEffect(() => {
    positions.current.clear();
    setSelectedId(null);
  }, [brandId, selectedLocationId]);

  const jumpToCategory = useCallback((id: string) => {
    if (!categories.some((category) => category.id === id)) return;
    const top = positions.current.get(id);
    if (top === undefined) return;
    setSelectedId(id);
    scrollRef.current?.scrollTo({
      y: Math.max(nativeInsets ? -headerHeight : 0, top - headerHeight - 12),
      animated: !reduceMotion
    });
  }, [categories, headerHeight, nativeInsets, reduceMotion]);

  const onSectionLayout = useCallback((id: string, event: LayoutChangeEvent) => {
    positions.current.set(id, event.nativeEvent.layout.y);
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const visibleTop = event.nativeEvent.contentOffset.y + headerHeight + 14;
    let current = categories[0]?.id ?? null;
    for (const category of categories) {
      const top = positions.current.get(category.id);
      if (top !== undefined && top <= visibleTop) current = category.id;
    }
    setSelectedId(current);
  }, [categories, headerHeight]);

  return {
    scrollRef, onScroll, onSectionLayout, jumpToCategory,
    selectedId: categories.some((category) => category.id === selectedId) ? selectedId : categories[0]?.id ?? null
  };
}
