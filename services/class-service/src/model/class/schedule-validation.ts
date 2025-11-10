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

/** NEW: attemptsAllowed must be an integer in [1, 10] */
function normalizeAttemptsAllowed(v: any): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.trunc(n);
  if (i < 1 || i > 10) return undefined;
  return i;
}

/** NEW: coerce common boolean-ish values; return undefined if invalid */
function normalizeBool(v: any): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "1") return true;
  if (v === 0 || v === "0") return false;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return undefined;
}

/**
 * CREATE validator
 * - Requires quizId, startDate, endDate
 * - endDate > startDate
 * - start & end must be today-or-later (class TZ)
 * - contribution optional; if present must be >= 0
 * - NEW: attemptsAllowed optional; if present must be integer 1..10
 * - NEW: showAnswersAfterAttempt optional; if present must be boolean
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
    attemptsAllowed: undefined, // NEW
    showAnswersAfterAttempt: undefined, // NEW
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

  // NEW: attemptsAllowed (optional; integer 1..10)
  if (body?.attemptsAllowed !== undefined) {
    const a = normalizeAttemptsAllowed(body.attemptsAllowed);
    if (a === undefined) {
      fieldErrors.attemptsAllowed =
        "attemptsAllowed must be an integer between 1 and 10";
    }
  }

  // NEW: showAnswersAfterAttempt (optional; boolean)
  if (body?.showAnswersAfterAttempt !== undefined) {
    const b = normalizeBool(body.showAnswersAfterAttempt);
    if (b === undefined) {
      fieldErrors.showAnswersAfterAttempt =
        "showAnswersAfterAttempt must be a boolean";
    }
  }

  const isValid = !Object.values(fieldErrors).some(Boolean);
  return { isValid, fieldErrors };
}

/**
 * EDIT validator
 * Inputs:
 *  - patch: { startDate?, endDate?, contribution?, attemptsAllowed?, showAnswersAfterAttempt? }
 *  - existing: current stored schedule item (must include startDate & endDate)
 * Rules:
 *  - If quiz has already started (class TZ): startDate **cannot change** (by day).
 *  - endDate may change anytime (still must be >= merged start).
 *  - If quiz has NOT started yet: merged start/end must still be today-or-later (class TZ).
 *  - contribution allowed anytime, must be ≥ 0 if provided.
 *  - NEW: attemptsAllowed allowed anytime; must be integer 1..10 if provided.
 *  - NEW: showAnswersAfterAttempt allowed anytime; must be boolean if provided.
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
    attemptsAllowed: undefined, // NEW
    showAnswersAfterAttempt: undefined, // NEW
  };

  // existing required
  const curStart = toDate(existing?.startDate);
  const curEnd = toDate(existing?.endDate);
  if (!curStart || !curEnd) {
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

  // Past-day rules (when NOT started)
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

  // NEW: attemptsAllowed (optional; integer 1..10)
  if (patch?.attemptsAllowed !== undefined) {
    const a = normalizeAttemptsAllowed(patch.attemptsAllowed);
    if (a === undefined) {
      fieldErrors.attemptsAllowed =
        "attemptsAllowed must be an integer between 1 and 10";
    }
  }

  // NEW: showAnswersAfterAttempt (optional; boolean)
  if (patch?.showAnswersAfterAttempt !== undefined) {
    const b = normalizeBool(patch.showAnswersAfterAttempt);
    if (b === undefined) {
      fieldErrors.showAnswersAfterAttempt =
        "showAnswersAfterAttempt must be a boolean";
    }
  }

  const isValid = !Object.values(fieldErrors).some(Boolean);
  return { isValid, fieldErrors };
}
