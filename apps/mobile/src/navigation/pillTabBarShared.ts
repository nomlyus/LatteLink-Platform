import type { Tabs } from "expo-router";
import type { ComponentProps } from "react";

export type PillTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

export type PillTabBarVariant = "classic" | "glass";
