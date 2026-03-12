import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Animates progress changes (0..1).
 * Uses JS driver because width interpolation is layout-bound.
 */
export function useAnimatedProgress(progress: number, durationMs = 280) {
  const animated = useRef(new Animated.Value(clamp01(progress))).current;

  useEffect(() => {
    const animation = Animated.timing(animated, {
      toValue: clamp01(progress),
      duration: Math.max(120, durationMs),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [animated, durationMs, progress]);

  return animated;
}
