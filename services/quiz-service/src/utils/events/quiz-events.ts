import { randomUUID } from "crypto";

/**
 * @func    buildQuizDeletedEvent
 * @input   { quizId: string, deletedAt?: string, purgeCount?: number }
 * @returns { eventId, type:"QuizDeleted", quizId, deletedAt, purgeCount }
 * @purpose Notify Class svc that a quiz was deleted; includes optional purge count info.
 */
export function buildQuizDeletedEvent(input: {
  quizId: string;
  deletedAt?: string; // ISO
  purgeCount?: number; // optional, informational
}) {
  return {
    eventId: randomUUID(),
    type: "QuizDeleted" as const,
    quizId: input.quizId,
    deletedAt: input.deletedAt ?? new Date().toISOString(),
    purgeCount: input.purgeCount ?? 0,
  };
}

/**
 * @func    buildQuizContentResetEvent
 * @input   {
 *           quizId, oldContentHash, newContentHash, purgedCount, resetAt?
 *          }
 * @returns { eventId, type:"QuizContentReset", quizId, resetAt, oldContentHash, newContentHash, purgedCount }
 * @purpose Emitted when quiz content changes and attempts are purged.
 */
export function buildQuizContentResetEvent(input: {
  quizId: string;
  oldContentHash: string;
  newContentHash: string;
  purgedCount: number;
  resetAt?: string; // ISO
}) {
  return {
    eventId: randomUUID(),
    type: "QuizContentReset" as const,
    quizId: input.quizId,
    resetAt: input.resetAt ?? new Date().toISOString(),
    oldContentHash: input.oldContentHash,
    newContentHash: input.newContentHash,
    purgedCount: input.purgedCount,
  };
}

/**
 * @func    buildQuizMetaUpdatedEvent
 * @input   { quizId, name?, subject?, subjectColorHex?, topic?, updatedAt? }
 * @returns {
 *           eventId, type:"QuizMetaUpdated", quizId, occurredAt,
 *           meta: { name?, subject?, subjectColorHex?, topic? }
 *          }
 * @purpose Lightweight metadata change notification (no content reset).
 */
export function buildQuizMetaUpdatedEvent(input: {
  quizId: string;
  name?: string;
  subject?: string;
  subjectColorHex?: string;
  topic?: string;
  updatedAt?: string; // ISO
}) {
  return {
    eventId: randomUUID(),
    type: "QuizMetaUpdated" as const,
    quizId: input.quizId,
    occurredAt: input.updatedAt ?? new Date().toISOString(),
    meta: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.subjectColorHex !== undefined
        ? { subjectColorHex: input.subjectColorHex }
        : {}),
      ...(input.topic !== undefined ? { topic: input.topic } : {}),
    },
  };
}
