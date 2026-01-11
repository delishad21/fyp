import crypto from "node:crypto";
import { enqueueEvent } from "./outbox-enqeue";

export type ScheduleUpdatedAction = "version_bumped" | "deleted";

/**
 * Mirror of quiz-svc ScheduleUpdatedEvent (minus Topic, which is set by publisher).
 */
export type ScheduleUpdatedEventPayload = {
  eventId: string;
  type: "ScheduleUpdated";
  scheduleId: string;
  classId: string;
  quizRootId: string; // canonical family id
  previousVersion?: number | null;
  newVersion?: number | null;
  action: ScheduleUpdatedAction;
  occurredAt: string; // ISO
};

/**
 * Builder input – two variants:
 *  - version_bumped: needs previousVersion & newVersion
 *  - deleted: just classId/scheduleId/rootQuizId
 */
type BuildScheduleUpdatedArgs =
  | {
      classId: string;
      scheduleId: string;
      quizRootId: string;
      action: "version_bumped";
      previousVersion: number;
      newVersion: number;
      occurredAt?: string;
    }
  | {
      classId: string;
      scheduleId: string;
      quizRootId: string;
      action: "deleted";
      occurredAt?: string;
    };

export function buildScheduleUpdatedEvent(
  args: BuildScheduleUpdatedArgs
): ScheduleUpdatedEventPayload {
  const occurredAt = args.occurredAt ?? new Date().toISOString();

  const base: ScheduleUpdatedEventPayload = {
    eventId: crypto.randomUUID(),
    type: "ScheduleUpdated",
    scheduleId: args.scheduleId,
    classId: args.classId,
    quizRootId: args.quizRootId,
    action: args.action,
    occurredAt,
  };

  if (args.action === "version_bumped") {
    base.previousVersion = args.previousVersion ?? null;
    base.newVersion = args.newVersion ?? null;
  }

  return base;
}

export async function emitScheduleUpdated(
  args: BuildScheduleUpdatedArgs
): Promise<void> {
  const evt = buildScheduleUpdatedEvent(args);
  await enqueueEvent("ScheduleUpdated", evt);
}
