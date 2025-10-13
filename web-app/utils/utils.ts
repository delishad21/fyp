// constant for redirect timouts
export const REDIRECT_TIMEOUT = 1000; // 1 second

// backup constants for request throttling
export const DEFAULT_RESEND_THROTTLE_SECONDS = 60;
export const DEFAULT_RESET_THROTTLE_SECONDS = 60;

// Constant for image upload limit
export const ALLOWED_FILE_SIZE = 2 * 1024 * 1024; // 2MB

// Color Palette for adding color labeled items
export const DEFAULT_COLOR_PALETTE = [
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#64748b",
];

export function classSvcUrl(path: string) {
  const base = (process.env.CLASS_SVC_URL || "").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Build the backend URL once. */
export function quizSvcUrl(path: string) {
  const base = (process.env.QUIZ_SVC_URL || "").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}
