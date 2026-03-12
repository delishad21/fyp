import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

type EntranceOptions = {
  delayMs?: number;
  durationMs?: number;
  fromY?: number;
};

/**
 * Lightweight screen/content entrance animation.
 * Uses native driver for good runtime performance.
 */
export function useEntranceAnimation(options?: EntranceOptions) {
  const delayMs = Number(options?.delayMs ?? 0);
  const durationMs = Number(options?.durationMs ?? 260);
  const fromY = Number(options?.fromY ?? 16);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(fromY)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: durationMs,
        delay: delayMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: durationMs,
        delay: delayMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [delayMs, durationMs, opacity, translateY]);

  return {
    opacity,
    transform: [{ translateY }],
  };
}
