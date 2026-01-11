import {
  ClassAttemptModel,
  ClassAttemptLean,
} from "../../model/events/class-attempt-model";

/** Lifecycle event shapes accepted from Quiz service */
export type LifecycleEvt =
  | { eventId: string; type: "QuizDeleted"; quizId: string; deletedAt: string }
  | {
      eventId: string;
      type: "QuizMetaUpdated";
      quizId: string;
      occurredAt: string;
      meta: {
        name?: string;
        subject?: string;
        subjectColorHex?: string;
        topic?: string;
      };
    }
  | {
      eventId: string;
      type: "QuizVersionUpdated";
      quizId: string; // root id
      previousVersion: number;
      newVersion: number;
      contentChanged: boolean;
      updateScope: "current_and_future";
      updatedAt: string;
    };

export function isLifecycleEvent(x: any): x is LifecycleEvt {
  if (!x || typeof x.eventId !== "string" || typeof x.type !== "string")
    return false;
  if (x.type === "QuizDeleted")
    return typeof x.quizId === "string" && typeof x.deletedAt === "string";
  if (x.type === "QuizMetaUpdated")
    return (
      typeof x.quizId === "string" &&
      typeof x.occurredAt === "string" &&
      x.meta &&
      typeof x.meta === "object"
    );
  if (x.type === "QuizVersionUpdated")
    return (
      typeof x.quizId === "string" &&
      typeof x.previousVersion === "number" &&
      typeof x.newVersion === "number" &&
      typeof x.updateScope === "string" &&
      typeof x.updatedAt === "string"
    );
  return false;
}

/** Attempt events we accept from Quiz service */
export type AttemptEvtType = "AttemptFinalized" | "AttemptInvalidated";

export type BaseAttemptEvt = {
  eventId: string;
  type: AttemptEvtType;
  occurredAt: string; // ISO
  attemptId: string;
  attemptVersion?: number;
  quizId: string; // concrete quiz version id
  quizRootId: string; // optional: not needed for class-side stats
  quizVersion: number; // optional: not needed for class-side stats
  classId: string | null; // may be null per contract
  scheduleId: string; // REQUIRED
  studentId: string;
  payload: {
    startedAt?: string;
    finishedAt?: string;
    score?: number;
    maxScore?: number;
    subject?: string;
    topic?: string;
  };
};

/** Pull out typed, defaulted fields from event envelope */
export function extractEventBasics(evt: BaseAttemptEvt) {
  const attemptVersion = evt.attemptVersion ?? 1;
  const { quizId, classId, studentId, scheduleId } = evt;

  const finishedAt = evt.payload.finishedAt
    ? new Date(evt.payload.finishedAt)
    : undefined;
  const subject =
    typeof evt.payload.subject === "string" ? evt.payload.subject : undefined;
  const score =
    typeof evt.payload.score === "number" ? evt.payload.score : undefined;
  const maxScore =
    typeof evt.payload.maxScore === "number" ? evt.payload.maxScore : undefined;

  // NEW
  const quizRootId =
    typeof (evt as any).quizRootId === "string"
      ? (evt as any).quizRootId
      : null;
  const quizVersion =
    typeof (evt as any).quizVersion === "number"
      ? (evt as any).quizVersion
      : null;

  return {
    attemptVersion,
    quizId,
    quizRootId,
    quizVersion,
    classId,
    studentId,
    scheduleId,
    finishedAt,
    subject,
    score,
    maxScore,
  };
}

export function isAttemptEvent(x: any): x is BaseAttemptEvt {
  return (
    x &&
    typeof x.eventId === "string" &&
    (x.type === "AttemptFinalized" || x.type === "AttemptInvalidated") &&
    typeof x.attemptId === "string" &&
    typeof x.quizId === "string" &&
    (typeof x.classId === "string" || x.classId === null) && // FIX
    typeof x.scheduleId === "string" &&
    typeof x.studentId === "string" &&
    x.payload &&
    typeof x.payload === "object"
  );
}

/** Get previously stored attempt row (for version ordering) */
export async function fetchPrevAttemptRow(attemptId: string) {
  return ClassAttemptModel.findOne({
    attemptId,
  }).lean<ClassAttemptLean | null>();
}

/** True if the incoming version is stale compared to stored row */
export function isOutOfOrder(
  prev: ClassAttemptLean | null,
  attemptVersion: number
) {
  return !!(prev && prev.attemptVersion >= attemptVersion);
}

/** Valid finalize events require numeric score + max */
export function isThisAttemptValidFinalize(
  type: AttemptEvtType,
  score?: number,
  max?: number
) {
  return (
    type === "AttemptFinalized" &&
    typeof score === "number" &&
    typeof max === "number"
  );
}

/** Build/merge the persisted attempt row kept for audit/rebuild */
export function buildUpsertAttemptDoc(
  evt: BaseAttemptEvt,
  prev: ClassAttemptLean | null,
  attemptVersion: number,
  classId: string,
  studentId: string,
  subject: string | undefined,
  finishedAt: Date | undefined,
  thisValidNow: boolean,
  score?: number,
  maxScore?: number
) {
  return {
    attemptId: evt.attemptId,
    attemptVersion,
    quizId: evt.quizId,

    // NEW: persist family identity (fallback to previous if missing)
    quizRootId: evt.quizRootId ?? prev?.quizRootId ?? "",
    quizVersion:
      typeof evt.quizVersion === "number"
        ? evt.quizVersion
        : prev?.quizVersion ?? 0,

    scheduleId: evt.scheduleId,
    classId,
    studentId,
    subject: subject ?? prev?.subject,
    topic: evt.payload.topic ?? prev?.topic,
    finishedAt: finishedAt ?? prev?.finishedAt,
    score: typeof score === "number" ? score : prev?.score,
    maxScore: typeof maxScore === "number" ? maxScore : prev?.maxScore,
    valid: thisValidNow,
  };
}

/** Upsert the class attempt audit row */
export async function upsertAttemptRow(attemptId: string, doc: any) {
  await ClassAttemptModel.updateOne(
    { attemptId },
    { $set: doc },
    { upsert: true }
  );
}
