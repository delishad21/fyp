import crypto from "node:crypto";
import { ClientSession } from "mongoose";
import { IAssignedQuiz } from "../../model/class/class-model";
import { enqueueEvent } from "./outbox-enqeue";
import {
  ClassCreatedEvent,
  ClassDeletedEvent,
  ClassUpdatedEvent,
  ScheduleCreatedEvent,
  ScheduleDeletedEvent,
  ScheduleLifecycleUpdatedEvent,
  StudentAddedToClassEvent,
  StudentRemovedFromClassEvent,
} from "./types";

type EmitOpts = { session?: ClientSession };

type ScheduleSnapshot = {
  scheduleId: string;
  quizRootId: string;
  quizVersion: number;
  contribution: number;
  startDate: string;
  endDate: string;
};

function nowIso(occurredAt?: string) {
  return occurredAt ?? new Date().toISOString();
}

function scheduleSnapshot(schedule: IAssignedQuiz): ScheduleSnapshot {
  return {
    scheduleId: String(schedule._id || ""),
    quizRootId: String(schedule.quizRootId || ""),
    quizVersion: Number(schedule.quizVersion || 0),
    contribution: Number(schedule.contribution ?? 100),
    startDate: new Date(schedule.startDate).toISOString(),
    endDate: new Date(schedule.endDate).toISOString(),
  };
}

export async function emitClassCreated(
  args: {
    classId: string;
    name: string;
    timezone: string;
    studentIds: string[];
    occurredAt?: string;
  },
  opts?: EmitOpts
) {
  const evt: ClassCreatedEvent = {
    eventId: crypto.randomUUID(),
    type: "ClassCreated",
    occurredAt: nowIso(args.occurredAt),
    classId: args.classId,
    name: args.name,
    timezone: args.timezone,
    studentIds: args.studentIds,
  };
  await enqueueEvent("ClassCreated", evt, opts);
}

export async function emitClassUpdated(
  args: {
    classId: string;
    name: string;
    timezone: string;
    occurredAt?: string;
  },
  opts?: EmitOpts
) {
  const evt: ClassUpdatedEvent = {
    eventId: crypto.randomUUID(),
    type: "ClassUpdated",
    occurredAt: nowIso(args.occurredAt),
    classId: args.classId,
    name: args.name,
    timezone: args.timezone,
  };
  await enqueueEvent("ClassUpdated", evt, opts);
}

export async function emitClassDeleted(
  args: { classId: string; occurredAt?: string },
  opts?: EmitOpts
) {
  const evt: ClassDeletedEvent = {
    eventId: crypto.randomUUID(),
    type: "ClassDeleted",
    occurredAt: nowIso(args.occurredAt),
    classId: args.classId,
  };
  await enqueueEvent("ClassDeleted", evt, opts);
}

export async function emitStudentAddedToClass(
  args: { classId: string; studentId: string; occurredAt?: string },
  opts?: EmitOpts
) {
  const evt: StudentAddedToClassEvent = {
    eventId: crypto.randomUUID(),
    type: "StudentAddedToClass",
    occurredAt: nowIso(args.occurredAt),
    classId: args.classId,
    studentId: args.studentId,
  };
  await enqueueEvent("StudentAddedToClass", evt, opts);
}

export async function emitStudentRemovedFromClass(
  args: { classId: string; studentId: string; occurredAt?: string },
  opts?: EmitOpts
) {
  const evt: StudentRemovedFromClassEvent = {
    eventId: crypto.randomUUID(),
    type: "StudentRemovedFromClass",
    occurredAt: nowIso(args.occurredAt),
    classId: args.classId,
    studentId: args.studentId,
  };
  await enqueueEvent("StudentRemovedFromClass", evt, opts);
}

export async function emitScheduleCreated(
  args: { classId: string; schedule: IAssignedQuiz; occurredAt?: string },
  opts?: EmitOpts
) {
  const snap = scheduleSnapshot(args.schedule);
  const evt: ScheduleCreatedEvent = {
    eventId: crypto.randomUUID(),
    type: "ScheduleCreated",
    occurredAt: nowIso(args.occurredAt),
    classId: args.classId,
    ...snap,
  };
  await enqueueEvent("ScheduleCreated", evt, opts);
}

export async function emitScheduleUpdatedLifecycle(
  args: { classId: string; schedule: IAssignedQuiz; occurredAt?: string },
  opts?: EmitOpts
) {
  const snap = scheduleSnapshot(args.schedule);
  const evt: ScheduleLifecycleUpdatedEvent = {
    eventId: crypto.randomUUID(),
    type: "ScheduleUpdated",
    occurredAt: nowIso(args.occurredAt),
    classId: args.classId,
    ...snap,
  };
  await enqueueEvent("ScheduleUpdatedLifecycle", evt, opts);
}

export async function emitScheduleDeleted(
  args: { classId: string; scheduleId: string; occurredAt?: string },
  opts?: EmitOpts
) {
  const evt: ScheduleDeletedEvent = {
    eventId: crypto.randomUUID(),
    type: "ScheduleDeleted",
    occurredAt: nowIso(args.occurredAt),
    classId: args.classId,
    scheduleId: args.scheduleId,
  };
  await enqueueEvent("ScheduleDeleted", evt, opts);
}
