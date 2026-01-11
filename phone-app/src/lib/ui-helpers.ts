/**
 * UI Helper utilities for consistent styling across the app
 */

/**
 * Calculates half of the screen height
 * Useful for constraining scrollable areas
 */
export function getHalfScreenHeight(): number {
  const { Dimensions } = require("react-native");
  return Math.round(Dimensions.get("window").height * 0.45);
}
