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

export const Topics = {
  Attempt: "quiz.attempt.v1",
  QuizLifecycle: "quiz.lifecycle.v1",
  ScheduleLifecycle: "class.schedule.v1",
  ClassLifecycle: "class.lifecycle.v1",
  Canonical: "class.canonical.v1",
} as const;
