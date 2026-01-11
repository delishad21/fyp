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

// ---- Unions / topics ----

export type LifecycleEvent =
  | QuizDeletedEvent
  | QuizMetaUpdatedEvent
  | QuizVersionUpdatedEvent;

export type AnyQuizOutboundEvent =
  | AttemptEvent
  | LifecycleEvent
  | ScheduleUpdatedEvent;

export const Topics = {
  Attempt: "quiz.attempt.v1",
  QuizLifecycle: "quiz.lifecycle.v1",
  ScheduleLifecycle: "class.schedule.v1",
} as const;
