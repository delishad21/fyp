import {
  AnswersPayload,
  AttemptDoc,
  AttemptRow,
  ItemCrossword,
} from "../api/quiz-service";

/** Crossword Helpers */
export const CELL = 36;
export const MIN_SCALE = 0.6;
export const MAX_SCALE = 3;
export const TAP_SLOP = 6;

export type Entry = ItemCrossword["entries"][number];

export type Params = {
  scheduleId?: string | string[];
  displayedAttemptId?: string | string[];
};

export function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const day = d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day}, ${time}`;
}

export function fmtClock(secs: number): string {
  const m = Math.max(0, Math.floor(secs / 60));
  const s = Math.max(0, secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function bestTime(a: Partial<AttemptRow>) {
  return new Date(a.finishedAt || a.startedAt || a.createdAt || 0).getTime();
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export type CrosswordGrid = ItemCrossword["grid"];

export function buildBlockedSet(grid: CrosswordGrid): Set<string> {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const set = new Set<string>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].isBlocked) set.add(`${r}:${c}`);
    }
  }
  return set;
}

export function touchDistance(nativeEvt: any): number {
  const touches = nativeEvt.touches || [];
  if (touches.length < 2) return 0;
  const [a, b] = touches;
  const dx = a.pageX - b.pageX;
  const dy = a.pageY - b.pageY;
  return Math.hypot(dx, dy);
}

export function touchCentroid(nativeEvt: any): { x: number; y: number } {
  const touches = nativeEvt.touches || [];
  if (touches.length < 2) {
    const a = touches[0];
    return { x: a?.pageX ?? 0, y: a?.pageY ?? 0 };
  }
  let x = 0,
    y = 0;
  for (const t of touches) {
    x += t.pageX;
    y += t.pageY;
  }
  return { x: x / touches.length, y: y / touches.length };
}

export function computeInitialGridTransform(params: {
  viewportWidth: number;
  viewportHeight: number;
  rows: number;
  cols: number;
  padding?: number;
}): { scale: number; translateX: number; translateY: number } {
  const { viewportWidth, viewportHeight, rows, cols, padding = 16 } = params;
  const vw = Math.max(0, viewportWidth - padding);
  const vh = Math.max(0, viewportHeight - padding);
  if (!vw || !vh || !rows || !cols) {
    return { scale: 1, translateX: 0, translateY: 0 };
  }

  const sx = vw / (cols * CELL);
  const sy = vh / (rows * CELL);
  const fit = clamp(Math.min(sx, sy), MIN_SCALE, MAX_SCALE);

  const cw = cols * CELL * fit;
  const ch = rows * CELL * fit;
  const tx = (vw - cw) / 2;
  const ty = (vh - ch) / 2;

  return { scale: fit, translateX: tx, translateY: ty };
}

/** Used in Rapid and Basic Play Screens */
export function normaliseInitialAnswers(attempt?: AttemptDoc): AnswersPayload {
  const init: AnswersPayload = {};
  const raw = attempt?.answers || {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as any)) {
      if (Array.isArray(v)) init[k] = v.map(String);
      else if (v && typeof v === "object" && "value" in v)
        init[k] = String((v as any).value ?? "");
      else init[k] = typeof v === "string" ? v : String(v ?? "");
    }
  }
  return init;
}
