import crypto from "node:crypto";
import { ClientSession } from "mongoose";
import { enqueueEvent } from "./outbox-enqeue";
import { CanonicalRemovedEvent, CanonicalUpsertedEvent } from "./types";

type EmitOpts = { session?: ClientSession };

function nowIso(occurredAt?: string) {
  return occurredAt ?? new Date().toISOString();
}

export async function emitCanonicalUpserted(
  args: {
    classId: string;
    studentId: string;
    scheduleId: string;
    contribution: number;
    attemptId: string;
    score: number;
    maxScore: number;
    finishedAt: Date;
    subject?: string;
    topic?: string;
    occurredAt?: string;
  },
  opts?: EmitOpts
) {
  const evt: CanonicalUpsertedEvent = {
    eventId: crypto.randomUUID(),
    type: "CanonicalUpserted",
    occurredAt: nowIso(args.occurredAt),
    classId: args.classId,
    studentId: args.studentId,
    scheduleId: args.scheduleId,
    contribution: Number(args.contribution),
    canonical: {
      attemptId: args.attemptId,
      score: args.score,
      maxScore: args.maxScore,
      finishedAt: args.finishedAt.toISOString(),
      ...(args.subject ? { subject: args.subject } : {}),
      ...(args.topic ? { topic: args.topic } : {}),
    },
  };

  await enqueueEvent("CanonicalUpserted", evt, opts);
}

export async function emitCanonicalRemoved(
  args: {
    classId: string;
    studentId: string;
    scheduleId: string;
    contribution: number;
    occurredAt?: string;
  },
  opts?: EmitOpts
) {
  const evt: CanonicalRemovedEvent = {
    eventId: crypto.randomUUID(),
    type: "CanonicalRemoved",
    occurredAt: nowIso(args.occurredAt),
    classId: args.classId,
    studentId: args.studentId,
    scheduleId: args.scheduleId,
    contribution: Number(args.contribution),
  };

  await enqueueEvent("CanonicalRemoved", evt, opts);
}
