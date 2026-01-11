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
  contentChanged: boolean; // true if items/timers changed
  updateScope: "current_and_future"; // reserved for future scopes
  updatedAt: string; // ISO
};

export type ScheduleUpdatedEvent = {
  eventId: string;
  type: "ScheduleUpdated";
  scheduleId: string;
  classId: string;
  quizRootId: string; // canonical family id
  previousVersion?: number | null;
  newVersion?: number | null;
  action: "version_bumped" | "deleted";
  occurredAt: string; // ISO
};

export type LifecycleEvent =
  | QuizDeletedEvent
  | QuizMetaUpdatedEvent
  | QuizVersionUpdatedEvent;

export type AnyQuizOutboundEvent =
  | AttemptEvent
  | LifecycleEvent
  | ScheduleUpdatedEvent;

/** Topic names */
export const Topics = {
  Attempt: "quiz.attempt.v1",
  QuizLifecycle: "quiz.lifecycle.v1",
  ScheduleLifecycle: "class.schedule.v1",
} as const;
