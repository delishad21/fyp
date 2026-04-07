// ---- Inbound from quiz-svc ----

export type AttemptEvtType = "AttemptFinalized" | "AttemptInvalidated";

export type AttemptEvent = {
  eventId: string;
  type: AttemptEvtType;
  occurredAt: string; // ISO
  attemptId: string;
  attemptVersion: number;
  quizId: string; // concrete quiz version _id
  quizRootId: string;
  quizVersion: number;
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

export type QuizDeletedEvent = {
  eventId: string;
  type: "QuizDeleted";
  quizId: string; // rootQuizId
  deletedAt: string; // ISO
  purgeCount?: number;
};

export type QuizMetaUpdatedEvent = {
  eventId: string;
  type: "QuizMetaUpdated";
  quizId: string; // rootQuizId
  occurredAt: string; // ISO
  meta: {
    name?: string;
    subject?: string;
    subjectColorHex?: string;
    topic?: string;
  };
};

export type QuizVersionUpdatedEvent = {
  eventId: string;
  type: "QuizVersionUpdated";
  quizId: string; // rootQuizId
  previousVersion: number;
  newVersion: number;
  contentChanged: boolean;
  updateScope: "current_and_future";
  updatedAt: string; // ISO
};

// ---- Outbound to quiz-svc ----

export type ScheduleUpdatedAction = "version_bumped" | "deleted";

export type ScheduleUpdatedEvent = {
  eventId: string;
  type: "ScheduleUpdated";
  scheduleId: string;
  classId: string;
  quizRootId: string;
  previousVersion?: number | null;
  newVersion?: number | null;
  action: ScheduleUpdatedAction;
  occurredAt: string; // ISO
};

// ---- Outbound to game-svc (class lifecycle) ----

export type ClassCreatedEvent = {
  eventId: string;
  type: "ClassCreated";
  occurredAt: string;
  classId: string;
  name: string;
  timezone: string;
  studentIds: string[];
};

export type ClassUpdatedEvent = {
  eventId: string;
  type: "ClassUpdated";
  occurredAt: string;
  classId: string;
  name: string;
  timezone: string;
};

export type ClassDeletedEvent = {
  eventId: string;
  type: "ClassDeleted";
  occurredAt: string;
  classId: string;
};

export type StudentAddedToClassEvent = {
  eventId: string;
  type: "StudentAddedToClass";
  occurredAt: string;
  classId: string;
  studentId: string;
};

export type StudentRemovedFromClassEvent = {
  eventId: string;
  type: "StudentRemovedFromClass";
  occurredAt: string;
  classId: string;
  studentId: string;
};

export type ScheduleCreatedEvent = {
  eventId: string;
  type: "ScheduleCreated";
  occurredAt: string;
  classId: string;
  scheduleId: string;
  quizRootId: string;
  quizVersion: number;
  contribution: number;
  startDate: string;
  endDate: string;
};

export type ScheduleLifecycleUpdatedEvent = {
  eventId: string;
  type: "ScheduleUpdated";
  occurredAt: string;
  classId: string;
  scheduleId: string;
  quizRootId: string;
  quizVersion: number;
  contribution: number;
  startDate: string;
  endDate: string;
};

export type ScheduleDeletedEvent = {
  eventId: string;
  type: "ScheduleDeleted";
  occurredAt: string;
  classId: string;
  scheduleId: string;
};

export type ClassLifecycleEvent =
  | ClassCreatedEvent
  | ClassUpdatedEvent
  | ClassDeletedEvent
  | StudentAddedToClassEvent
  | StudentRemovedFromClassEvent
  | ScheduleCreatedEvent
  | ScheduleLifecycleUpdatedEvent
  | ScheduleDeletedEvent;

// ---- Outbound to game-svc (canonical reconciliation) ----

export type CanonicalUpsertedEvent = {
  eventId: string;
  type: "CanonicalUpserted";
  occurredAt: string;
  classId: string;
  studentId: string;
  scheduleId: string;
  contribution?: number;
  canonical: {
    attemptId: string;
    score: number;
    maxScore: number;
    finishedAt: string;
    subject?: string;
    topic?: string;
  };
};

export type CanonicalRemovedEvent = {
  eventId: string;
  type: "CanonicalRemoved";
  occurredAt: string;
  classId: string;
  studentId: string;
  scheduleId: string;
  contribution?: number;
};

export type CanonicalEvent = CanonicalUpsertedEvent | CanonicalRemovedEvent;

// ---- Unions / topics ----

export type LifecycleEvent =
  | QuizDeletedEvent
  | QuizMetaUpdatedEvent
  | QuizVersionUpdatedEvent;

export type AnyQuizOutboundEvent =
  | AttemptEvent
  | LifecycleEvent
  | ScheduleUpdatedEvent
  | ClassLifecycleEvent
  | CanonicalEvent;

export const Topics = {
  Attempt: "quiz.attempt.v1",
  QuizLifecycle: "quiz.lifecycle.v1",
  ScheduleLifecycle: "class.schedule.v1",
  ClassLifecycle: "class.lifecycle.v1",
  Canonical: "class.canonical.v1",
} as const;
