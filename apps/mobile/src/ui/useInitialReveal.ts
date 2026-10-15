import { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";

/** A one-time loading overlay; subsequent query refreshes leave content visible. */
export function useInitialReveal(
  pending: boolean,
  {
    initiallyVisible = true,
    resetKey,
    skipAnimation = false
  }: { initiallyVisible?: boolean; resetKey?: string | null; skipAnimation?: boolean } = {}
) {
  const loadingOpacity = useRef(new Animated.Value(1)).current;
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(initiallyVisible);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (resetKey === undefined) return;
    setFinished(false);
    setShowLoadingOverlay(true);
    loadingOpacity.stopAnimation();
    loadingOpacity.setValue(1);
  }, [loadingOpacity, resetKey]);

  useEffect(() => {
    if (finished) return;
    if (skipAnimation) {
      loadingOpacity.setValue(0);
      setShowLoadingOverlay(false);
      setFinished(true);
      return;
    }
    if (pending) {
      setShowLoadingOverlay(true);
      loadingOpacity.stopAnimation();
      loadingOpacity.setValue(1);
      return;
    }
    if (!showLoadingOverlay) {
      setFinished(true);
      return;
    }
    const animation = Animated.timing(loadingOpacity, { toValue: 0, duration: 260, useNativeDriver: true });
    animation.start(({ finished: completed }) => {
      if (!completed) return;
      setShowLoadingOverlay(false);
      setFinished(true);
    });
    return () => animation.stop();
  }, [finished, loadingOpacity, pending, resetKey, showLoadingOverlay, skipAnimation]);

  return { loadingOpacity, showLoadingOverlay };
}
