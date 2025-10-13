import {
  startOfDay,
  endOfDay,
  addDays,
  differenceInCalendarDays,
  isAfter,
  isBefore,
} from "date-fns";
import { ScheduleItem } from "../../types/class-types";

export const RESIZE_SPRING = {
  type: "spring" as const,
  stiffness: 380,
  damping: 34,
  mass: 0.6,
};
import type { ApiScheduleItem } from "@/services/class/actions/class-schedule-actions";

// Track / viewport constants
export const VISIBLE_DAYS = 7;
export const BUFFER = 7; // 7 col left + 7 col right
export const TRACK_COLS = VISIBLE_DAYS + BUFFER * 2; // 21 total

export const BASE_DAY_MIN = 96; // base min height in px for a day cell
export const ROW_PX = 36; // pill row height
export const ROW_GAP = 8; // gap between pill rows

// Springs
export const HEIGHT_SPRING = {
  type: "spring" as const,
  stiffness: 350,
  damping: 32,
  mass: 0.8,
};

// Local day utilities (DST-safe)
export function ymdToLocalDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
export function endOfLocalDate(ymd: string) {
  return endOfDay(ymdToLocalDate(ymd));
}
export function dateToLocalYMD(d: Date) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
export function addLocalDays(d: Date, n: number) {
  return startOfDay(addDays(d, n));
}
export function diffLocalDays(a: Date, b: Date) {
  return differenceInCalendarDays(a, b);
}
export function clampToRangeUTC(d: Date, startUTC: Date, endUTC: Date) {
  return new Date(
    Math.min(endUTC.getTime(), Math.max(startUTC.getTime(), d.getTime()))
  );
}
export function colIndexForUTCDate(d: Date, baseStartUTC: Date) {
  // returns 1..TRACK_COLS inclusive (CSS grid columns are 1-based)
  const idx = diffLocalDays(
    ymdToLocalDate(dateToLocalYMD(d)),
    ymdToLocalDate(dateToLocalYMD(baseStartUTC))
  );
  return Math.min(TRACK_COLS - 1, Math.max(0, idx)) + 1;
}
export function isoDayUTC(d: Date) {
  return dateToLocalYMD(d);
}
export function tzDayKey(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** ==============================================
 * Lane builder for SevenDayCalendar / PillsGrid
 * =============================================== */

export type LaneItem = ScheduleItem & {
  colStart: number;
  colEnd: number;
  lane: number;
  clippedLeft: boolean;
  clippedRight: boolean;
};

export function buildLanes(
  items: ScheduleItem[],
  trackStart: Date,
  trackEnd: Date,
  visibleStart: Date,
  visibleEnd: Date,
  laneLockMap?: Map<string, number>, // lock by clientId (resizing)
  stickyLaneMap?: Map<string, number> // prefer previous lanes (during interaction)
): LaneItem[] {
  // Normalize & clip to track range
  const normalized = items
    .map((it) => {
      const itStartUTC = ymdToLocalDate(dateToLocalYMD(new Date(it.startDate)));
      const itEndUTC = endOfLocalDate(dateToLocalYMD(new Date(it.endDate)));

      if (isAfter(itStartUTC, trackEnd) || isBefore(itEndUTC, trackStart))
        return null;

      const clippedLeft = isBefore(itStartUTC, visibleStart);
      const clippedRight = isAfter(itEndUTC, visibleEnd);

      const s = clampToRangeUTC(itStartUTC, trackStart, trackEnd);
      const e = clampToRangeUTC(itEndUTC, trackStart, trackEnd);

      const cs = colIndexForUTCDate(s, trackStart);
      const ce = colIndexForUTCDate(e, trackStart);

      return {
        it,
        colStart: Math.min(cs, ce),
        colEnd: Math.max(cs, ce),
        clippedLeft,
        clippedRight,
        startTime: itStartUTC.getTime(),
        duration: itEndUTC.getTime() - itStartUTC.getTime(),
      } as const;
    })
    .filter(Boolean) as Array<{
    it: ScheduleItem;
    colStart: number;
    colEnd: number;
    clippedLeft: boolean;
    clippedRight: boolean;
    startTime: number;
    duration: number;
  }>;

  // Stable sort by position/time for deterministic packing
  normalized.sort((a, b) => {
    if (a.colStart !== b.colStart) return a.colStart - b.colStart;
    if (a.startTime !== b.startTime) return a.startTime - b.startTime;
    if (a.duration !== b.duration) return b.duration - a.duration;
    const nameComp = (a.it.quizName ?? "").localeCompare(b.it.quizName ?? "");
    if (nameComp !== 0) return nameComp;
    return String(a.it.quizId).localeCompare(String(b.it.quizId));
  });

  const lanes: LaneItem[] = [];
  const laneEnd: number[] = []; // highest end column occupied per lane

  // Identify a single locked pill (resizing)
  let lockedKey: string | undefined;
  let lockedLane: number | undefined;
  if (laneLockMap && laneLockMap.size > 0) {
    const [clientId, lane] = Array.from(laneLockMap.entries())[0];
    lockedKey = clientId;
    lockedLane = lane;
  }

  // Find the locked pill span (do NOT pre-seed laneEnd to avoid pushing earlier items).
  let lockedSpan: { start: number; end: number } | undefined;
  if (lockedKey !== undefined && lockedLane !== undefined) {
    const n = normalized.find((x) => x.it.clientId === lockedKey);
    if (n) {
      lockedSpan = { start: n.colStart, end: n.colEnd };
    }
  }

  // Pack greedily left-to-right; prefer sticky lane if it fits, else lowest valid lane.
  for (const n of normalized) {
    let target = -1;

    if (lockedKey && n.it.clientId === lockedKey && lockedLane !== undefined) {
      while (laneEnd.length <= lockedLane) laneEnd.push(-Infinity);
      target = lockedLane;
      laneEnd[target] = Math.max(laneEnd[target] ?? -Infinity, n.colEnd);
    } else {
      const L = laneEnd.length;
      const baseline = stickyLaneMap?.get(n.it.clientId);
      const order: number[] = [];
      if (baseline !== undefined) {
        for (let l = 0; l < Math.min(baseline, L); l++) order.push(l);
        if (baseline < L) order.push(baseline);
        for (let l = Math.max(baseline + 1, 0); l < L; l++) order.push(l);
      } else {
        for (let l = 0; l < L; l++) order.push(l);
      }

      for (const lane of order) {
        const end = laneEnd[lane] ?? -Infinity;
        const conflictsLocked =
          lane === lockedLane &&
          lockedSpan &&
          !(n.colEnd < lockedSpan.start || n.colStart > lockedSpan.end);
        if (!conflictsLocked && n.colStart > end) {
          target = lane;
          break;
        }
      }

      if (target === -1) {
        let idx = laneEnd.length;
        for (;;) {
          const conflictsLocked =
            idx === lockedLane &&
            lockedSpan &&
            !(n.colEnd < lockedSpan.start || n.colStart > lockedSpan.end);
          if (!conflictsLocked) break;
          idx += 1;
        }
        while (laneEnd.length <= idx) laneEnd.push(-Infinity);
        target = idx;
        laneEnd[target] = Math.max(laneEnd[target] ?? -Infinity, n.colEnd);
      } else {
        laneEnd[target] = Math.max(laneEnd[target] ?? -Infinity, n.colEnd);
      }
    }

    lanes.push({
      ...n.it,
      colStart: n.colStart,
      colEnd: n.colEnd,
      lane: target,
      clippedLeft: n.clippedLeft,
      clippedRight: n.clippedRight,
    });
  }

  return lanes;
}

/** ==============================
 * Helpers for SchedulerBoard
 * ============================== */

export function hasStarted(it: { startDate: string }, classTimezone: string) {
  const today = tzDayKey(new Date(), classTimezone);
  const startYMD = tzDayKey(new Date(it.startDate), classTimezone);
  return startYMD <= today;
}

/** Find the day cell under the pointer by scanning the entire stack */
export function findDayFromPoint(
  clientX: number,
  clientY: number
): string | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    const day = (el as HTMLElement).dataset?.day;
    if (day) return day;
  }
  return null;
}
// Attach clientIds for any missing (e.g., initial data without clientId)
export function withClientIds(items: ApiScheduleItem[]): ScheduleItem[] {
  return items.map((it) => ({
    ...it,
    clientId:
      (it as any).clientId ??
      it._id ??
      `c-${crypto.randomUUID?.() || Math.random().toString(16).slice(2)}`,
  }));
}

/** Inspect DOM under pointer to tell if inside calendar and/or on a past day */
export function getPointerZone(clientX: number, clientY: number) {
  const stack = document.elementsFromPoint(clientX, clientY) as HTMLElement[];
  let insideCalendar = false;
  let day: string | null = null;
  let isPast = false;
  for (const el of stack) {
    if (!insideCalendar && el.dataset?.calRoot === "1") insideCalendar = true;
    const d = el.dataset?.day;
    if (d && !day) {
      day = d;
      isPast = el.dataset?.past === "1";
    }
  }
  return { insideCalendar, day, isPast };
}

// Toast helper to print fieldErrors
export function formatSchedulerBoardFieldErrors(
  fe?: Record<string, any>
): string {
  if (!fe || typeof fe !== "object") return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(fe)) {
    if (Array.isArray(v)) parts.push(`${k}: ${v.join(", ")}`);
    else if (v != null) parts.push(`${k}: ${String(v)}`);
  }
  return parts.length ? `\n${parts.join("\n")}` : "";
}
