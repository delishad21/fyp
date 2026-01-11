/**
 * Color utility functions for hex color manipulation
 */

/**
 * Converts a hex color to rgba format with specified alpha
 * Supports both #RGB and #RRGGBB formats
 */
export function hexToRgba(hex: string, alpha: number): string {
  const h = (hex || "").trim();
  if (!h.startsWith("#")) return `rgba(0,0,0,${alpha})`;

  const raw = h.slice(1);
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;

  if (full.length !== 6) return `rgba(0,0,0,${alpha})`;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Determines if a hex color is dark based on perceived luminance
 * Uses the relative luminance formula (ITU-R BT.709)
 */
export function isDarkHex(hex: string): boolean {
  const h = (hex || "").trim();
  if (!h.startsWith("#")) return false;

  const raw = h.slice(1);
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;

  if (full.length !== 6) return false;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  // Perceived luminance (ITU-R BT.709)
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.5;
}
