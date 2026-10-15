import { canUseLiquidGlass } from "../ui/glass";

import { ClassicPillTabBar } from "./ClassicPillTabBar";
import { LiquidGlassPillTabBar } from "./LiquidGlassPillTabBar";
import type { PillTabBarProps } from "./pillTabBarShared";

export function PillTabBar(props: PillTabBarProps) {
  return canUseLiquidGlass() ? <LiquidGlassPillTabBar {...props} /> : <ClassicPillTabBar {...props} />;
}
