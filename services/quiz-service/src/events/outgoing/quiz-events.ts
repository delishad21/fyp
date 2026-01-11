import { randomUUID } from "crypto";
import {
  QuizDeletedEvent,
  QuizMetaUpdatedEvent,
  QuizVersionUpdatedEvent,
} from "../types";

export function buildQuizDeletedEvent(input: {
  quizId: string;
  deletedAt?: string;
  purgeCount?: number;
}): QuizDeletedEvent {
  return {
    eventId: randomUUID(),
    type: "QuizDeleted",
    quizId: input.quizId,
    deletedAt: input.deletedAt ?? new Date().toISOString(),
    purgeCount: input.purgeCount ?? 0,
  };
}

export function buildQuizMetaUpdatedEvent(input: {
  quizId: string;
  name?: string;
  subject?: string;
  subjectColorHex?: string;
  topic?: string;
  updatedAt?: string;
}): QuizMetaUpdatedEvent {
  return {
    eventId: randomUUID(),
    type: "QuizMetaUpdated",
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

export function buildQuizVersionUpdatedEvent(input: {
  quizId: string;
  previousVersion: number;
  newVersion: number;
  contentChanged: boolean;
  updatedAt?: string;
}): QuizVersionUpdatedEvent {
  return {
    eventId: randomUUID(),
    type: "QuizVersionUpdated",
    quizId: input.quizId,
    previousVersion: input.previousVersion,
    newVersion: input.newVersion,
    contentChanged: input.contentChanged,
    updateScope: "current_and_future",
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}
