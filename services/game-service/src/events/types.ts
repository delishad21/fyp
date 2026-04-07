export type AttemptEvtType = "AttemptFinalized" | "AttemptInvalidated";

export type AttemptEvent = {
  eventId: string;
  type: AttemptEvtType;
  occurredAt: string;
  attemptId: string;
  attemptVersion: number;
  quizId: string;
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

export type ClassLifecycleEvent =
  | {
      eventId: string;
      type: "ClassCreated";
      occurredAt: string;
      classId: string;
      name: string;
      timezone: string;
      studentIds: string[];
    }
  | {
      eventId: string;
      type: "ClassUpdated";
      occurredAt: string;
      classId: string;
      name: string;
      timezone: string;
    }
  | {
      eventId: string;
      type: "ClassDeleted";
      occurredAt: string;
      classId: string;
    }
  | {
      eventId: string;
      type: "StudentAddedToClass";
      occurredAt: string;
      classId: string;
      studentId: string;
    }
  | {
      eventId: string;
      type: "StudentRemovedFromClass";
      occurredAt: string;
      classId: string;
      studentId: string;
    }
  | {
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
    }
  | {
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
    }
  | {
      eventId: string;
      type: "ScheduleDeleted";
      occurredAt: string;
      classId: string;
      scheduleId: string;
    };

export type CanonicalEvent =
  | {
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
    }
  | {
      eventId: string;
      type: "CanonicalRemoved";
      occurredAt: string;
      classId: string;
      studentId: string;
      scheduleId: string;
      contribution?: number;
    };

export const Topics = {
  Attempt: "quiz.attempt.v1",
  QuizLifecycle: "quiz.lifecycle.v1",
  ScheduleLifecycle: "class.schedule.v1",
  ClassLifecycle: "class.lifecycle.v1",
  Canonical: "class.canonical.v1",
} as const;
