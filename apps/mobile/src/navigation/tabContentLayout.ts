import { createContext, useContext } from "react";

export type TabContentLayout = {
  native: true;
  /** Scroll-content clearance, not viewport padding: content draws behind the native bar. */
  contentBottomInset: number;
};

export const TabContentLayoutContext = createContext<TabContentLayout | null>(null);
export function useTabContentLayout() {
  return useContext(TabContentLayoutContext);
}

export function getNativeTabContentBottomInset(bottomSafeArea: number) {
  return bottomSafeArea + 24;
}
