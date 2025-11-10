import { CreatedStudent } from "./user-svc-client";

/** Build embedded student subdocument (identity/display only). */
export function toClassStudent(
  s: CreatedStudent,
  className: string,
  defaultPhotoUrl?: string
) {
  return {
    userId: s.userId,
    className,
    displayName: (s.name ?? "").trim() || s.username,
    photoUrl: defaultPhotoUrl ?? null,
  };
}

export type CanonicalBySchedule = Record<
  string,
  {
    attemptId: string;
    score: number;
    maxScore: number;
    finishedAt?: string | Date;
  }
>;

export type ScheduleRow = {
  scheduleId: string;
  quizName: string;
  subject: string | null;
  subjectColorHex: string | null;
  topic: string | null;
  latestAttemptId?: string;
  latestAt?: string; // ISO
  attemptsCount: number;
  canonical?: {
    attemptId: string;
    score: number;
    maxScore: number;
    gradePct: number; // 0..100 rounded
  };
};

export type AttemptLite = {
  _id: string;
  classId: string;
  scheduleId?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt?: string;
  quiz?: {
    name?: string;
    subject?: string;
    subjectColorHex?: string;
    topic?: string;
  };
};

export type SchedulePack = {
  attempts: AttemptLite[];
  latest?: AttemptLite;
};

export function pct(score?: number, max?: number) {
  if (!max || max <= 0 || !score) return 0;
  return Math.max(0, Math.min(100, Math.round((score / max) * 100)));
}

/** for getAttemptableSchedulesForStudent */

export type OpenRow = {
  _id: any; // classId
  schedule: {
    _id: any;
    quizId: string;
    startDate: Date;
    endDate: Date;
    contribution?: number;
    attemptsAllowed?: number;
    showAnswersAfterAttempt?: boolean;
    quizName?: string;
    subject?: string;
    subjectColor?: string;
  };
};

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyFilters<
  T extends {
    quizName: string;
    subject: string | null;
    topic: string | null;
    latestAt?: string;
  }
>(
  rows: T[],
  f: {
    nameRegex: RegExp | null;
    subject: string;
    topic: string;
    latestFrom: Date | null;
    latestTo: Date | null;
  }
) {
  const subj = f.subject ? f.subject.toLowerCase() : "";
  const top = f.topic ? f.topic.toLowerCase() : "";

  return rows.filter((r) => {
    if (f.nameRegex && !f.nameRegex.test(r.quizName || "")) return false;

    if (subj && (r.subject ?? "").toLowerCase() !== subj) return false;

    if (top && (r.topic ?? "").toLowerCase() !== top) return false;

    if (f.latestFrom || f.latestTo) {
      if (!r.latestAt) return false;
      const t = new Date(r.latestAt).getTime();
      if (f.latestFrom && t < f.latestFrom.getTime()) return false;
      if (f.latestTo && t > f.latestTo.getTime()) return false;
    }
    return true;
  });
}
