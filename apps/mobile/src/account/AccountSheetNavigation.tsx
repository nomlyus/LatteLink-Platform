import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useHeaderHeight } from "expo-router/react-navigation";

const HeaderMetricsContext = createContext<{
  height: number;
  updateHeight: (height: number) => void;
} | null>(null);

export function AccountSheetNavigation({ children }: { children: ReactNode }) {
  const [height, updateHeight] = useState(0);
  const value = useMemo(() => ({ height, updateHeight }), [height]);
  return <HeaderMetricsContext.Provider value={value}>{children}</HeaderMetricsContext.Provider>;
}

/** Measure on the overview, before a subpage mounts with an estimated header height. */
export function AccountHeaderMeasurement() {
  const height = useHeaderHeight();
  const updateHeight = useContext(HeaderMetricsContext)?.updateHeight;
  useLayoutEffect(() => {
    if (height > 0) updateHeight?.(height);
  }, [height, updateHeight]);
  return null;
}

export function useAccountSheetHeaderHeight() {
  return useContext(HeaderMetricsContext)?.height ?? 0;
}
