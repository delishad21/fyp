/**
 * Custom hook that stores the latest value in a ref
 * Useful for accessing the most recent value in callbacks without causing re-renders
 */

import { useEffect, useRef } from "react";

/**
 * Returns a ref that always contains the latest value
 * The ref is updated after every render
 *
 * @param value - The value to store in the ref
 * @returns A ref object containing the current value
 *
 * @example
 * const answersRef = useLatest(answers);
 * // Later in a callback:
 * const currentAnswers = answersRef.current;
 */
export function useLatest<T>(value: T): React.RefObject<T> {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref as React.RefObject<T>;
}
