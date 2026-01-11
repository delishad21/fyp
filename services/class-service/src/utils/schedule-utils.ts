import { ClassModel } from "../model/class/class-model";
import { StudentClassStatsModel } from "../model/stats/student-stats-model";
import {
  QuizSvcBatchRow,
  fetchQuizzesByCanonical,
  QuizCanonicalSelector,
} from "./quiz-svc-client";
import { ymdInTZ } from "./utils";

/** Return schedule array as plain objects with string ids */
export function scheduleOut(c: any) {
  return (c.schedule || []).map((s: any) => {
    const plain = s?.toObject ? s.toObject() : s;
    const sid = plain?._id?.toString?.();
    return {
      ...plain,
      _id: sid || plain._id,
      id: sid || plain.id,
    };
  });
}

/** Attach live quiz meta if available; otherwise use stored snapshot.
 *  Assumes quizRootId + quizVersion are the canonical identity and does NOT fall back to quizId.
 */
export function attachQuizMeta(
  it: any,
  q?: QuizSvcBatchRow
): {
  _id: string;
  quizId: string;
  quizRootId: string | null;
  quizVersion: number | null;
  quizName?: string;
  subject?: string;
  subjectColor?: string;
  topic?: string;
  quizType?: string;
  typeColorHex?: string;
  startDate: string;
  endDate: string;
  contribution?: number;
  showAnswersAfterAttempt: boolean;
  attemptsAllowed: number;
} {
  // Canonical identity: prefer schedule row; otherwise quiz meta; no fallback to quizId
  const quizRootId = (it as any).quizRootId ?? (q as any)?.rootQuizId ?? null;

  const quizVersion =
    typeof (it as any).quizVersion === "number"
      ? (it as any).quizVersion
      : typeof (q as any)?.version === "number"
      ? (q as any).version
      : null;

  const quizName = q?.name ?? it.quizName;
  const subject = q?.subject ?? it.subject;
  const subjectColor = q?.subjectColorHex ?? it.subjectColor;

  // extras from quiz svc (fallback to stored snapshot)
  const topic = q?.topic ?? it.topic;
  const quizType = q?.quizType ?? it.quizType;
  const typeColorHex = (q as any)?.typeColorHex ?? it.typeColorHex;

  return {
    _id: String(it._id),
    quizId: String(it.quizId),

    quizRootId: quizRootId !== null ? String(quizRootId) : null,
    quizVersion: quizVersion !== null ? quizVersion : null,

    quizName,
    subject,
    subjectColor,
    topic,
    quizType,
    typeColorHex,
    startDate: new Date(it.startDate).toISOString(),
    endDate: new Date(it.endDate).toISOString(),
    contribution: Number(it?.contribution ?? 100),
    showAnswersAfterAttempt: Boolean(it?.showAnswersAfterAttempt),
    attemptsAllowed:
      typeof it?.attemptsAllowed === "number" ? it.attemptsAllowed : 1,
  };
}

/** Interval overlap using precise instants (inclusive) */
export function rangesOverlap(
  aStart: Date | string,
  aEnd: Date | string,
  bStart: Date | string,
  bEnd: Date | string
) {
  const a0 = new Date(aStart).getTime();
  const a1 = new Date(aEnd).getTime();
  const b0 = new Date(bStart).getTime();
  const b1 = new Date(bEnd).getTime();
  return a0 <= b1 && b0 <= a1;
}

/** Load class by ID with optional projection */
export async function loadClassById(id: string, projection?: any) {
  const c = await ClassModel.findById(id, projection).lean();
  if (!c) throw httpError(404, "Class not found");
  return c;
}

/** Extract timezone string from class doc (default Asia/Singapore) */
export function extractClassTimezone(c: any): string {
  return (c.timezone && String(c.timezone)) || "Asia/Singapore";
}

/**
 * Fetch a single quiz’s live metadata by canonical identity (rootQuizId + version), best-effort.
 *
 * NOTE: Signature changed — it no longer accepts quizId.
 */
export async function fetchQuizMetaOnce(
  rootQuizId: string,
  version: number
): Promise<QuizSvcBatchRow | undefined> {
  try {
    const { byCanonical } = await fetchQuizzesByCanonical([
      { rootQuizId, version },
    ]);
    const rows = Object.values(byCanonical);
    return rows.length ? rows[0] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Batch fetch quiz metadata by canonical identity.
 *
 * @param selectors Array of { rootQuizId, version } objects.
 * @returns Record keyed by canonical key `${rootQuizId}:${version}`.
 *
 * NOTE: Signature & keying changed — previously keyed by quizId.
 */
export async function fetchQuizMetaBatch(
  selectors: QuizCanonicalSelector[]
): Promise<Record<string, QuizSvcBatchRow>> {
  if (!selectors.length) return {};
  try {
    const { byCanonical } = await fetchQuizzesByCanonical(selectors);
    return byCanonical;
  } catch {
    return {};
  }
}

/** Detect overlap among schedule ranges for a specific quiz identity.
 *  Uses ONLY quizRootId + quizVersion as identity. quizId is ignored here.
 */
export function hasScheduleConflict(
  schedule: any[],
  identity: {
    quizRootId: string;
    quizVersion: number;
  },
  startDate: Date,
  endDate: Date,
  excludeIndex?: number
): boolean {
  const newRoot = String(identity.quizRootId);
  const newVersion = identity.quizVersion;

  return schedule.some((s, i) => {
    if (excludeIndex != null && i === excludeIndex) return false;

    const sRoot =
      (s as any).quizRootId != null ? String((s as any).quizRootId) : null;
    const sVersion =
      typeof (s as any).quizVersion === "number"
        ? (s as any).quizVersion
        : null;

    // If either side is missing canonical identity, treat as different quiz.
    if (!sRoot || sVersion === null) return false;

    const sameIdentity = sRoot === newRoot && sVersion === newVersion;
    if (!sameIdentity) return false;

    return rangesOverlap(startDate, endDate, s.startDate, s.endDate);
  });
}

/** Compute participation & score aggregates */
export function computeAggregates(canonicals: any[], totalStudents: number) {
  const participants = canonicals.length;
  const participationPct =
    totalStudents > 0 ? Math.round((participants / totalStudents) * 100) : 0;
  const sumScore = canonicals.reduce((a, c) => a + (Number(c.score) || 0), 0);
  const sumMax = canonicals.reduce((a, c) => a + (Number(c.maxScore) || 0), 0);
  const avgPct = sumMax > 0 ? Math.round((sumScore / sumMax) * 100) : 0;
  const avgAbsScore =
    participants > 0 ? Math.round(sumScore / participants) : 0;
  const avgAbsMax = participants > 0 ? Math.round(sumMax / participants) : 0;

  return {
    participants,
    totalStudents,
    participationPct,
    sumScore,
    sumMax,
    avgPct,
    avgAbsScore,
    avgAbsMax,
  };
}

/** Map StudentClassStats → canonical attempts for given schedule */
export async function loadCanonicalAttempts(
  classId: string,
  scheduleId: string
) {
  const canPath = `canonicalBySchedule.${scheduleId}`;
  const rows = await StudentClassStatsModel.find(
    { classId, [`${canPath}.attemptId`]: { $exists: true, $ne: "" } },
    { studentId: 1, [canPath]: 1 }
  ).lean();

  return rows
    .map((r: any) => {
      const block = r?.canonicalBySchedule?.[scheduleId];
      if (!block) return null;
      return {
        studentId: String(r.studentId),
        attemptId: String(block.attemptId || ""),
        score: Number(block.score ?? 0),
        maxScore: Number(block.maxScore ?? 0),
        finishedAt: block.finishedAt ? new Date(block.finishedAt) : undefined,
      };
    })
    .filter(Boolean);
}

/** Build roster map (studentId → {displayName, photoUrl}) */
export function buildRosterMap(students: any[]) {
  const map = new Map<
    string,
    { displayName: string; photoUrl?: string | null }
  >();
  for (const s of students || []) {
    map.set(String(s.userId), {
      displayName: String(s.displayName || ""),
      photoUrl: typeof s.photoUrl === "string" ? s.photoUrl : null,
    });
  }
  return map;
}

/** Utility to safely build canonicalAttemptsDetailed array */
export function enrichCanonicals(
  canonicals: any[],
  rosterMap: Map<string, any>
) {
  return canonicals.map((c) => {
    const roster = rosterMap.get(c.studentId);
    const pct =
      c.maxScore > 0
        ? Math.round((Math.max(0, c.score) / Math.max(1, c.maxScore)) * 100)
        : 0;
    return {
      attemptId: c.attemptId,
      studentId: c.studentId,
      displayName: roster?.displayName ?? "",
      photoUrl: roster?.photoUrl ?? null,
      score: c.score,
      maxScore: c.maxScore,
      pct,
      finishedAt: c.finishedAt ? c.finishedAt.toISOString() : null,
    };
  });
}

/** Ensure consistent HTTP-like error object */
export function httpError(status: number, message: string): any {
  const e: any = new Error(message);
  e._http = status;
  return e;
}

/** Convert schedule doc to lean output with meta */
export function enrichScheduleItem(item: any, quizMeta?: QuizSvcBatchRow) {
  return attachQuizMeta(item, quizMeta);
}

/** for getAttemptableSchedulesForMe */
export type AttemptableRow = {
  scheduleId: string;

  // Concrete quiz id (still stored but not used for identity)
  quizId: string;

  // Canonical quiz identity (required)
  quizRootId: string;
  quizVersion: number;

  startDate: string;
  endDate: string;
  attemptsAllowed: number; // effective (1..10)
  showAnswersAfterAttempt: boolean; // effective
  attemptsCount: number; // current (non-invalidated)
  attemptsRemaining: number; // max(0, allowed - count)
  quizName?: string | null;
  subject?: string | null;
  subjectColor?: string | null;
};

export function normalizeAllowedAttempts(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(10, Math.round(n)));
}

export function getDayKeyInTZ(date: Date, timeZone: string): string {
  return ymdInTZ(date, timeZone);
}

export function isScheduleOnDayInTZ(
  startDate: Date | string,
  endDate: Date | string,
  dayKey: string,
  timeZone: string
): boolean {
  const startKey = ymdInTZ(new Date(startDate), timeZone);
  const endKey = ymdInTZ(new Date(endDate), timeZone);
  return startKey <= dayKey && dayKey <= endKey;
}
