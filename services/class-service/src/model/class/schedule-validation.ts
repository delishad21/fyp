export type ValidationResult = {
  isValid: boolean;
  fieldErrors: Record<string, string | string[] | undefined>;
};

type ValidateOpts = { timeZone?: string };

/** Utility: "YYYY-MM-DD" in a specific TZ */
function tzDayKey(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function toDate(x: any): Date | undefined {
  if (!x) return undefined;
  const d = new Date(x);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function normalizeContribution(v: any): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * CREATE validator
 * - Requires quizId, startDate, endDate
 * - endDate > startDate
 * - start & end must be today-or-later (class TZ)
 * - contribution optional; if present must be >= 0
 */
export function validateScheduleCreate(
  body: any,
  opts?: ValidateOpts
): ValidationResult {
  const timeZone =
    (opts?.timeZone && String(opts.timeZone)) || "Asia/Singapore";
  const fieldErrors: Record<string, string | undefined> = {
    quizId: undefined,
    startDate: undefined,
    endDate: undefined,
    contribution: undefined,
  };

  // quizId
  if (!body?.quizId || typeof body.quizId !== "string") {
    fieldErrors.quizId = "quizId is required";
  }

  // dates
  const start = toDate(body?.startDate);
  const end = toDate(body?.endDate);
  if (!start) fieldErrors.startDate = "startDate must be a valid date";
  if (!end) fieldErrors.endDate = "endDate must be a valid date";

  if (start && end && !fieldErrors.startDate && !fieldErrors.endDate) {
    if (start >= end) fieldErrors.endDate = "endDate must be after startDate";
  }

  // past-day checks (class TZ)
  const todayKey = tzDayKey(new Date(), timeZone);
  if (start && !fieldErrors.startDate && tzDayKey(start, timeZone) < todayKey) {
    fieldErrors.startDate =
      "startDate must be today or later (per class timezone)";
  }
  if (end && !fieldErrors.endDate && tzDayKey(end, timeZone) < todayKey) {
    fieldErrors.endDate = "endDate must be today or later (per class timezone)";
  }

  // contribution (optional)
  const c = normalizeContribution(body?.contribution);
  if (body?.contribution !== undefined) {
    if (c === undefined || c < 0) {
      fieldErrors.contribution = "contribution must be a number ≥ 0";
    }
  }

  const isValid = !Object.values(fieldErrors).some(Boolean);
  return { isValid, fieldErrors };
}

/**
 * EDIT validator
 * Inputs:
 *  - patch: { startDate?, endDate?, contribution? }
 *  - existing: current stored schedule item (must include startDate & endDate)
 * Rules:
 *  - If quiz has already started (class TZ): startDate **cannot change** (by day).
 *  - endDate may change anytime (still must be >= merged start).
 *  - If quiz has NOT started yet: merged start/end must still be today-or-later (class TZ).
 *  - contribution allowed anytime, must be ≥ 0 if provided.
 */
export function validateScheduleEdit(
  patch: any,
  existing: { startDate: string | Date; endDate: string | Date },
  opts?: ValidateOpts
): ValidationResult {
  const timeZone =
    (opts?.timeZone && String(opts.timeZone)) || "Asia/Singapore";
  const fieldErrors: Record<string, string | undefined> = {
    startDate: undefined,
    endDate: undefined,
    contribution: undefined,
  };

  // existing required
  const curStart = toDate(existing?.startDate);
  const curEnd = toDate(existing?.endDate);
  if (!curStart || !curEnd) {
    // If existing is malformed, treat as invalid edit request
    return {
      isValid: false,
      fieldErrors: {
        startDate: !curStart ? "existing startDate is invalid" : undefined,
        endDate: !curEnd ? "existing endDate is invalid" : undefined,
      },
    };
  }

  // Determine if quiz "has started" in class TZ (start day <= today)
  const todayKey = tzDayKey(new Date(), timeZone);
  const startKey = tzDayKey(curStart, timeZone);
  const hasStarted = startKey <= todayKey;

  // Proposed values (merged)
  const nextStart = toDate(patch?.startDate) ?? curStart;
  const nextEnd = toDate(patch?.endDate) ?? curEnd;

  // If started, disallow startDate day-change
  if (hasStarted && patch?.startDate) {
    const patchStartKey = tzDayKey(nextStart, timeZone);
    if (patchStartKey !== startKey) {
      fieldErrors.startDate =
        "Start date can’t be changed after the quiz has started.";
    }
  }

  // Chronological order (always enforced)
  if (nextStart && nextEnd && nextStart >= nextEnd) {
    fieldErrors.endDate = "endDate must be after startDate";
  }

  // Past-day rules:
  //  • If NOT started yet → start & end must be today-or-later (same as create)
  //  • If started → allow end anywhere (as long as ≥ start); start already locked above
  if (!hasStarted) {
    if (nextStart && tzDayKey(nextStart, timeZone) < todayKey) {
      fieldErrors.startDate =
        "startDate must be today or later (per class timezone)";
    }
    if (nextEnd && tzDayKey(nextEnd, timeZone) < todayKey) {
      fieldErrors.endDate =
        "endDate must be today or later (per class timezone)";
    }
  }

  // contribution (optional; allowed anytime)
  if (patch?.contribution !== undefined) {
    const c = normalizeContribution(patch.contribution);
    if (c === undefined || c < 0) {
      fieldErrors.contribution = "contribution must be a number ≥ 0";
    }
  }

  const isValid = !Object.values(fieldErrors).some(Boolean);
  return { isValid, fieldErrors };
}
