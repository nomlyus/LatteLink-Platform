import { useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useRef } from "react";
import type { LayoutChangeEvent } from "react-native";
import { createScrollEdgeRegistration } from "./scrollEdgeRegistration";

type EdgeNavigation = {
  setOptions: (options: { scrollEdgeEffects: { top: "automatic" | "soft" } }) => void;
};

export function useNativeScrollEdge(enabled: boolean) {
  const navigation = useNavigation<EdgeNavigation>();
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;
  const registrationRef = useRef<ReturnType<typeof createScrollEdgeRegistration> | null>(null);
  // A retained native view doesn't emit another layout event just because the
  // navigation object changes or Fast Refresh reruns memo factories.
  if (!registrationRef.current) {
    registrationRef.current = createScrollEdgeRegistration({
      setStyle: (top) => navigationRef.current.setOptions({ scrollEdgeEffects: { top } }),
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (frame) => cancelAnimationFrame(frame)
    });
  }
  const registration = registrationRef.current;

  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    registration.activate();
    return () => registration.deactivate();
  }, [enabled, registration]));

  return useCallback((event: LayoutChangeEvent) => {
    const target = event.currentTarget ?? event.target;
    if (target !== undefined && target !== null) registration.onLayout(target);
  }, [registration]);
}
