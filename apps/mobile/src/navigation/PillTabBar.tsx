import type { ComponentProps, ReactNode } from "react";
import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import Constants from "expo-constants";
import { Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "../cart/store";

const labelMap: Record<string, string> = {
  home: "Home",
  menu: "Menu",
  cart: "Cart",
  account: "Account"
};

type PillTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

type LiquidGlassViewProps = {
  children: ReactNode;
  style: {
    borderRadius: number;
    overflow: "hidden";
  };
  effect?: "clear" | "regular" | "none";
  colorScheme?: "light" | "dark" | "system";
};

const isExpoGo = Constants.appOwnership === "expo";

function renderGlassShell(children: ReactNode) {
  if (Platform.OS === "ios" && !isExpoGo) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { LiquidGlassView, isLiquidGlassSupported } = require("@callstack/liquid-glass") as {
        LiquidGlassView: React.ComponentType<LiquidGlassViewProps>;
        isLiquidGlassSupported: boolean;
      };

      if (isLiquidGlassSupported) {
        return (
          <LiquidGlassView
            effect="regular"
            colorScheme="light"
            style={{
              borderRadius: 999,
              overflow: "hidden"
            }}
          >
            {children}
          </LiquidGlassView>
        );
      }
    } catch {
      // Fall through to expo-blur when the native module is unavailable.
    }
  }

  return (
    <BlurView
      tint="light"
      intensity={Platform.OS === "ios" ? 95 : 62}
      style={{
        borderRadius: 999,
        overflow: "hidden"
      }}
    >
      <View pointerEvents="none" className="absolute inset-0">
        <View className="absolute inset-x-1 inset-y-1 rounded-full border border-white/20" />
      </View>
      {children}
    </BlurView>
  );
}

export function PillTabBar({ state, descriptors, navigation }: PillTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { itemCount } = useCart();
  const bottomOffset = insets.bottom > 0 ? 28 : 30;
  const pillWidth = Math.min(width - 24, 520);
  const horizontalOffset = Math.max((width - pillWidth) / 2, 12);

  return (
    <View
      className="absolute"
      style={{ bottom: bottomOffset, left: horizontalOffset, width: pillWidth }}
      pointerEvents="box-none"
    >
      <View
        className="overflow-hidden rounded-full"
        style={{
          shadowColor: "#242327",
          shadowOpacity: 0.14,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
          elevation: 10
        }}
      >
        {renderGlassShell(
          <View
            className="h-[60px] flex-row items-center gap-1.5 rounded-full border px-2 py-2"
            style={{
              backgroundColor: "rgba(244, 236, 230, 0.26)",
              borderColor: "rgba(213, 200, 190, 0.34)"
            }}
          >
            {state.routes.map((route, index) => {
              const descriptor = descriptors[route.key];
              const isFocused = state.index === index;
              const label =
                typeof descriptor.options.title === "string"
                  ? descriptor.options.title
                  : labelMap[route.name] ?? route.name;

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
                <Pressable
                  key={route.key}
                  className="relative h-[48px] flex-1 items-center justify-center rounded-full bg-transparent"
                  style={
                    isFocused
                      ? {
                          backgroundColor: "rgba(255, 255, 255, 0.62)",
                          borderWidth: 1,
                          borderColor: "rgba(255, 255, 255, 0.38)",
                          shadowColor: "#242327",
                          shadowOpacity: 0.07,
                          shadowRadius: 6,
                          shadowOffset: { width: 0, height: 1 },
                          elevation: 1
                        }
                      : undefined
                  }
                  onPress={onPress}
                  accessibilityRole="button"
                  accessibilityState={isFocused ? { selected: true } : {}}
                  accessibilityLabel={descriptor.options.tabBarAccessibilityLabel}
                >
                  <Text
                    className="text-[10px] font-semibold uppercase tracking-[2.2px]"
                    style={{ color: isFocused ? "#242327" : "#9F7965" }}
                  >
                    {label}
                  </Text>

                  {route.name === "cart" && itemCount > 0 ? (
                    <View className="absolute right-1 top-1 min-w-5 rounded-full bg-[#242327] px-1.5 py-[2px]">
                      <Text className="text-center text-[10px] font-bold text-[#F4ECE6]">{itemCount}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}
