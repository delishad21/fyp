import { AttemptEvent, AttemptEvtType } from "./types";
import { GameAttemptLean, GameAttemptModel } from "../model/events/game-attempt-model";

export function isAttemptEvent(x: any): x is AttemptEvent {
  return (
    x &&
    typeof x.eventId === "string" &&
    (x.type === "AttemptFinalized" || x.type === "AttemptInvalidated") &&
    typeof x.attemptId === "string" &&
    typeof x.quizId === "string" &&
    (typeof x.classId === "string" || x.classId === null) &&
    typeof x.scheduleId === "string" &&
    typeof x.studentId === "string" &&
    x.payload &&
    typeof x.payload === "object"
  );
}

function safeDate(v?: string) {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function extractEventBasics(evt: AttemptEvent) {
  const attemptVersion =
    typeof evt.attemptVersion === "number" ? evt.attemptVersion : 1;

  const finishedAt = safeDate(evt.payload?.finishedAt);
  const subject =
    typeof evt.payload?.subject === "string" ? evt.payload.subject : undefined;
  const topic =
    typeof evt.payload?.topic === "string" ? evt.payload.topic : undefined;
  const score =
    typeof evt.payload?.score === "number" ? evt.payload.score : undefined;
  const maxScore =
    typeof evt.payload?.maxScore === "number" ? evt.payload.maxScore : undefined;

  return {
    attemptVersion,
    quizId: evt.quizId,
    quizRootId: evt.quizRootId,
    quizVersion: evt.quizVersion,
    classId: evt.classId,
    scheduleId: evt.scheduleId,
    studentId: evt.studentId,
    finishedAt,
    subject,
    topic,
    score,
    maxScore,
  };
}

export async function fetchPrevAttemptRow(attemptId: string) {
  return GameAttemptModel.findOne({ attemptId }).lean<GameAttemptLean | null>();
}

export function isOutOfOrder(prev: GameAttemptLean | null, attemptVersion: number) {
  return !!(prev && prev.attemptVersion >= attemptVersion);
}

export function isThisAttemptValidFinalize(
  type: AttemptEvtType,
  score?: number,
  maxScore?: number
) {
  return (
    type === "AttemptFinalized" &&
    typeof score === "number" &&
    typeof maxScore === "number"
  );
}

export function buildUpsertAttemptDoc(
  evt: AttemptEvent,
  prev: GameAttemptLean | null,
  thisValidNow: boolean
) {
  const { attemptVersion, classId, studentId, scheduleId, quizId, quizRootId, quizVersion, finishedAt, subject, topic, score, maxScore } =
    extractEventBasics(evt);

  if (!classId) {
    throw new Error("Missing classId for class-scoped game attempt event");
  }

  return {
    attemptId: evt.attemptId,
    attemptVersion,
    quizId,
    quizRootId,
    quizVersion,
    scheduleId,
    classId,
    studentId,
    subject: subject ?? prev?.subject,
    topic: topic ?? prev?.topic,
    finishedAt: finishedAt ?? prev?.finishedAt,
    score: typeof score === "number" ? score : prev?.score,
    maxScore: typeof maxScore === "number" ? maxScore : prev?.maxScore,
    valid: thisValidNow,
  };
}

export async function upsertAttemptRow(attemptId: string, doc: any) {
  await GameAttemptModel.updateOne({ attemptId }, { $set: doc }, { upsert: true });
}
