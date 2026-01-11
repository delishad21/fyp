/**
 * Custom hook for setting up intervals that automatically clean up
 * and properly handle callback updates
 */

import { useEffect, useRef } from "react";

/**
 * Creates an interval that calls the callback function at the specified delay
 * The callback ref is updated on each render so it always uses the latest version
 * The interval is automatically cleared on unmount or when delay changes
 *
 * @param callback - Function to call at each interval
 * @param delayMs - Delay in milliseconds between calls (null to disable interval)
 */
export function useInterval(
  callback: () => void,
  delayMs: number | null
): void {
  const callbackRef = useRef(callback);

  // Update callback ref on each render
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Set up the interval
  useEffect(() => {
    if (delayMs === null) return;

    const intervalId = setInterval(() => callbackRef.current(), delayMs);

    return () => clearInterval(intervalId);
  }, [delayMs]);
}
