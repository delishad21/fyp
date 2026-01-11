/**
 * Custom hook for tracking the keyboard height on iOS and Android
 */

import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Tracks the current keyboard height and returns it
 * Automatically handles platform differences between iOS and Android
 * On iOS, uses willShow/willHide for smooth animations
 * On Android, uses didShow/didHide for actual keyboard state
 *
 * @returns The current keyboard height in pixels (0 when keyboard is hidden)
 *
 * @example
 * const keyboardHeight = useKeyboardHeight();
 * // Use in styles: marginBottom: keyboardHeight
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent =
      Platform.OS === "android" ? "keyboardDidShow" : "keyboardWillShow";
    const hideEvent =
      Platform.OS === "android" ? "keyboardDidHide" : "keyboardWillHide";

    const onShow = (e: any) => {
      setHeight(e?.endCoordinates?.height ?? 0);
    };

    const onHide = () => {
      setHeight(0);
    };

    const showSubscription = Keyboard.addListener(showEvent, onShow);
    const hideSubscription = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return height;
}
