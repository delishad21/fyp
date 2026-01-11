import { randomUUID } from "crypto";
import type { AttemptEvent, AttemptEvtType } from "../types";
import { AttemptDoc } from "../../model/quiz-attempt-model";
import { getFamilyMetaMap } from "../../model/quiz-base-model";
import { enqueueEvent } from "./outbox-enqueue";

/**
 * Build a canonical AttemptEvent body.
 */
export function buildAttemptEvent(input: {
  type: AttemptEvtType; // "AttemptFinalized" | "AttemptInvalidated"
  attemptId: string;
  attemptVersion?: number;
  quizId: string; // concrete quiz version id
  quizRootId: string;
  quizVersion: number;
  classId: string | null;
  studentId: string;
  scheduleId: string;
  startedAt?: Date;
  finishedAt?: Date;
  score?: number;
  maxScore?: number;
  subject?: string;
  topic?: string;
}): AttemptEvent {
  const eventId = randomUUID();
  const occurredAt = new Date().toISOString();

  return {
    eventId,
    type: input.type,
    occurredAt,
    attemptId: input.attemptId,
    attemptVersion: input.attemptVersion ?? 1,
    quizId: input.quizId,
    quizRootId: input.quizRootId,
    quizVersion: input.quizVersion,
    classId: input.classId,
    scheduleId: input.scheduleId,
    studentId: input.studentId,
    payload: {
      startedAt: input.startedAt?.toISOString(),
      finishedAt: input.finishedAt?.toISOString(),
      score: input.score,
      maxScore: input.maxScore,
      subject: input.subject ?? undefined,
      topic: input.topic ?? undefined,
    },
  };
}

/** Minimal shape we need from an Attempt doc to emit events */
type AttemptDocForEvent = Pick<
  AttemptDoc,
  | "_id"
  | "attemptVersion"
  | "quizId"
  | "quizRootId"
  | "quizVersion"
  | "classId"
  | "scheduleId"
  | "studentId"
  | "startedAt"
  | "finishedAt"
  | "score"
  | "maxScore"
> & {
  quizVersionSnapshot?: any;
};

/** Resolve subject/topic from live quiz meta, falling back to snapshot */
async function subjectTopicFromAttempt(
  attempt: AttemptDocForEvent
): Promise<{ subject?: string; topic?: string }> {
  const rootId = attempt.quizRootId;
  let subject: string | undefined;
  let topic: string | undefined;

  if (rootId) {
    const metaMap = await getFamilyMetaMap([String(rootId)]);
    const liveMeta = metaMap.get(String(rootId));
    if (liveMeta) {
      if (typeof liveMeta.subject === "string") subject = liveMeta.subject;
      if (typeof liveMeta.topic === "string") topic = liveMeta.topic;
    }
  }

  // fallback to snapshot if live meta not available
  if (!subject || !topic) {
    const snapMeta = (attempt as any)?.quizVersionSnapshot?.meta || {};
    if (!subject && typeof snapMeta.subject === "string") {
      subject = snapMeta.subject;
    }
    if (!topic && typeof snapMeta.topic === "string") {
      topic = snapMeta.topic;
    }
  }

  return { subject, topic };
}

/** Public helper to emit AttemptFinalized / AttemptInvalidated via outbox */
export async function emitAttemptEvent(
  type: AttemptEvtType,
  attempt: AttemptDocForEvent
) {
  const { subject, topic } = await subjectTopicFromAttempt(attempt);

  const body = buildAttemptEvent({
    type,
    attemptId: String(attempt._id),
    attemptVersion: attempt.attemptVersion ?? 1,
    quizId: String(attempt.quizId),
    quizRootId: String(attempt.quizRootId),
    quizVersion: attempt.quizVersion,
    classId: attempt.classId ? String(attempt.classId) : null,
    scheduleId: attempt.scheduleId ? String(attempt.scheduleId) : "",
    studentId: String(attempt.studentId),
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    score: attempt.score,
    maxScore: attempt.maxScore,
    subject,
    topic,
  });

  await enqueueEvent(type, body);
}
