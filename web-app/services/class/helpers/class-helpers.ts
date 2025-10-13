import { Cell, RowData } from "../../quiz/types/quiz-table-types";
import { ClassStudent } from "../actions/remove-student-action";
import {
  BasicOrRapidAttemptType,
  CrosswordAttemptType,
} from "../types/class-types";

export const DEFAULT_IMG = "/images/classroom-placeholder.png";

type FE = Record<string, any>;
export function normalizeFieldErrors(fe: FE | undefined): FE {
  if (!fe) return {};
  const out: FE = { ...fe };

  // students: (undefined|null | {..})[]  -> (undefined | {..})[]
  if (Array.isArray(out.students)) {
    out.students = out.students.map((e: any) => (e == null ? undefined : e));
  }

  // schedule: (string[] | undefined|null)[] -> (string[] | undefined)[]
  if (Array.isArray(out.schedule)) {
    out.schedule = out.schedule.map((e: any) => (e == null ? undefined : e));
  }

  return out;
}

export function readJsonMaybe<T = any>(v: unknown): T | undefined {
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function coerceArray<T = any>(v: unknown): T[] | undefined {
  return Array.isArray(v) ? (v as T[]) : undefined;
}

export function mapStudentsToRows(students: ClassStudent[]): RowData[] {
  return students.map((s) => {
    const avatarCell: Cell = {
      variant: "avatar",
      data: { src: s.photoUrl || undefined, name: s.displayName, size: 55 },
    };
    const nameCell: Cell = { variant: "normal", data: { text: s.displayName } };
    const rankCell: Cell = {
      variant: "normal",
      data: { text: String(s.rank ?? "-") },
    };
    const partCell: Cell = {
      variant: "progressbar",
      data: { current: s.participationPct ?? 0, total: 100 },
    };
    const scoreCell: Cell = {
      variant: "progressbar",
      data: { current: s.avgScorePct ?? 0, total: 100 },
    };
    const streakCell: Cell = {
      variant: "normal",
      data: { text: `${s.streakDays ?? 0} Days` },
    };

    return {
      id: s.userId,
      cells: [avatarCell, nameCell, rankCell, partCell, scoreCell, streakCell],
    };
  });
}

/**
 * AttemptHeader Helpers
 */
export function normalizeHex(v?: string) {
  if (!v) return undefined;
  return v.startsWith("#") ? v : `#${v}`;
}
export function pct(score?: number, max?: number) {
  const s = Number(score || 0);
  const m = Number(max || 0);
  if (m <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((s / m) * 100)));
}

export function clampPct(n: unknown) {
  const x = Number(n);
  const r = Number.isFinite(x) ? Math.round(x) : 0;
  return Math.max(0, Math.min(100, r));
}

export function fmtDate(d?: string) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString(undefined, {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function fmtDateWithTZ(d?: string, timeZone?: string) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString(undefined, {
      timeZone: timeZone || "Asia/Singapore",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/**
 * BasicOrRapidAttempt Helpers
 */

export function breakdownMapBasicOrRapid(
  breakdown?: BasicOrRapidAttemptType["breakdown"]
): Map<string, { awarded: number; max: number; meta?: any }> {
  const m = new Map<string, { awarded: number; max: number; meta?: any }>();
  (breakdown ?? []).forEach((b) => m.set(b.itemId, b));
  return m;
}

export function getAnswerValue(
  itemId: string,
  answers: BasicOrRapidAttemptType["answers"]
) {
  if (itemId in (answers || {})) return answers[itemId];
  return undefined;
}

/**
 * CrosswordAttempt Helpers
 */

export function breakdownMapCrossword(
  breakdown?: CrosswordAttemptType["breakdown"]
): Map<string, { awarded: number; max: number; meta?: any }> {
  const m = new Map<string, { awarded: number; max: number; meta?: any }>();
  (breakdown ?? []).forEach((b) => m.set(b.itemId, b));
  return m;
}

/** Podium Helpers */

export const CAPTION_H = "h-14";

// medal border palette
export const GOLD = "#f59e0b"; // amber-500
export const SILVER = "#c0c0c0";
export const BRONZE = "#b87333";
