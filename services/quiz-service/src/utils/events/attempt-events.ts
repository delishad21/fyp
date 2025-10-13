import { randomUUID } from "crypto";

export type QuizAttemptEvent =
  | { type: "AttemptFinalized"; body: BaseAttemptEvt }
  | { type: "AttemptEdited"; body: BaseAttemptEvt }
  | { type: "AttemptInvalidated"; body: BaseAttemptEvt };

type BaseAttemptEvt = {
  eventId: string;
  type: "AttemptFinalized" | "AttemptEdited" | "AttemptInvalidated";
  occurredAt: string; // ISO
  attemptId: string;
  attemptVersion?: number;
  quizId: string;
  classId: string | null;
  scheduleId: string;
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

/**
 * @func    buildAttemptEvent
 * @input   {
 *           type, attemptId, attemptVersion?, quizId, classId|null, scheduleId,
 *           studentId, startedAt?, finishedAt?, score?, maxScore?, subject?, topic?
 *          }
 * @returns BaseAttemptEvt  // fully-formed event body with deterministic eventId
 * @purpose Create a canonical, idempotent attempt event envelope for the outbox/webhook.
 */
export function buildAttemptEvent(input: {
  type: BaseAttemptEvt["type"];
  attemptId: string;
  attemptVersion?: number;
  quizId: string;
  classId: string | null;
  studentId: string;
  scheduleId: string;
  startedAt?: Date;
  finishedAt?: Date;
  score?: number;
  maxScore?: number;
  subject?: string;
  topic?: string;
}) {
  const eventId = randomUUID();
  const occurredAt = new Date().toISOString();

  // Build canonical body (only serializable primitives/strings in payload).
  const body: BaseAttemptEvt = {
    eventId,
    type: input.type,
    occurredAt,
    attemptId: input.attemptId,
    attemptVersion: input.attemptVersion ?? 1,
    quizId: input.quizId,
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

  return body;
}
