import type { ReactNode } from "react";
import { useIsFocused } from "expo-router";
import { View } from "react-native";
import { FallbackCartAccessory } from "./FallbackCartAccessory";

/** Web keeps a regular cart action; it cannot render the native accessory. */
export function JavaScriptTabScreen({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  return (
    <View style={{ flex: 1 }}>
      {children}
      {focused ? <FallbackCartAccessory /> : null}
    </View>
  );
}
