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

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDayKey(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

export function dayKeyFromUTCDate(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dayKeyToUTCDate(ymd: string) {
  const { y, m, d } = parseDayKey(ymd);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

export function addDaysToDayKey(ymd: string, n: number) {
  const d = dayKeyToUTCDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return dayKeyFromUTCDate(d);
}

export function diffDayKeys(a: string, b: string) {
  const aUtc = dayKeyToUTCDate(a).getTime();
  const bUtc = dayKeyToUTCDate(b).getTime();
  return Math.round((aUtc - bUtc) / DAY_MS);
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const vals: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") vals[p.type] = p.value;
  }
  const asUTC = Date.UTC(
    Number(vals.year),
    Number(vals.month) - 1,
    Number(vals.day),
    Number(vals.hour),
    Number(vals.minute),
    Number(vals.second)
  );
  return asUTC - date.getTime();
}

export function makeDateInTZ(
  dayKey: string,
  timeZone: string,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0
) {
  const { y, m, d } = parseDayKey(dayKey);
  const utcMillis = Date.UTC(y, m - 1, d, hour, minute, second, ms);
  let dt = new Date(utcMillis);
  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMs(dt, timeZone);
    const next = new Date(utcMillis - offset);
    if (next.getTime() === dt.getTime()) break;
    dt = next;
  }
  return dt;
}

export function startOfDayInTZ(dayKey: string, timeZone: string) {
  return makeDateInTZ(dayKey, timeZone, 0, 0, 0, 0);
}

export function endOfDayInTZ(dayKey: string, timeZone: string) {
  return makeDateInTZ(dayKey, timeZone, 23, 59, 59, 0);
}

export function dayKeyFromDateInTZ(d: Date, timeZone: string) {
  return tzDayKey(d, timeZone);
}

export function formatWeekdayInTZ(dayKey: string, timeZone: string) {
  const d = makeDateInTZ(dayKey, timeZone, 12, 0, 0, 0);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(d);
}

export function formatMonthDayInTZ(dayKey: string, timeZone: string) {
  const d = makeDateInTZ(dayKey, timeZone, 12, 0, 0, 0);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(d);
}

export function formatTimeInTZ(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const vals: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") vals[p.type] = p.value;
  }
  return `${vals.hour}:${vals.minute}`;
}

export function getTimePartsInTZ(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const vals: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") vals[p.type] = p.value;
  }
  return {
    hour: Number(vals.hour || 0),
    minute: Number(vals.minute || 0),
    second: Number(vals.second || 0),
  };
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

export function colIndexForDayKey(dayKey: string, baseStartKey: string) {
  // returns 1..TRACK_COLS inclusive (CSS grid columns are 1-based)
  const idx = diffDayKeys(dayKey, baseStartKey);
  return Math.min(TRACK_COLS - 1, Math.max(0, idx)) + 1;
}

export function buildLanes(
  items: ScheduleItem[],
  trackStartKey: string,
  trackEndKey: string,
  visibleStartKey: string,
  visibleEndKey: string,
  classTimezone: string,
  laneLockMap?: Map<string, number>, // lock by clientId (resizing)
  stickyLaneMap?: Map<string, number> // prefer previous lanes (during interaction)
): LaneItem[] {
  // Normalize & clip to track range
  const normalized = items
    .map((it) => {
      const itStartKey = dayKeyFromDateInTZ(
        new Date(it.startDate),
        classTimezone
      );
      const itEndKey = dayKeyFromDateInTZ(
        new Date(it.endDate),
        classTimezone
      );

      if (itStartKey > trackEndKey || itEndKey < trackStartKey) return null;

      const clippedLeft = itStartKey < visibleStartKey;
      const clippedRight = itEndKey > visibleEndKey;

      const sKey = itStartKey < trackStartKey ? trackStartKey : itStartKey;
      const eKey = itEndKey > trackEndKey ? trackEndKey : itEndKey;

      const cs = colIndexForDayKey(sKey, trackStartKey);
      const ce = colIndexForDayKey(eKey, trackStartKey);

      return {
        it,
        colStart: Math.min(cs, ce),
        colEnd: Math.max(cs, ce),
        clippedLeft,
        clippedRight,
        startTime: diffDayKeys(sKey, trackStartKey),
        duration: diffDayKeys(eKey, sKey),
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
  const start = new Date(it.startDate);
  return start.getTime() <= Date.now();
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
