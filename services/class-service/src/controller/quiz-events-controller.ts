import { Request, Response } from "express";
import { Types } from "mongoose";
import { InboundQuizEventModel } from "../model/events/inbound-quiz-event-model";
import { ClassModel } from "../model/class/class-model";
import { ClassAttemptModel } from "../model/events/class-attempt-model";

import {
  isAttemptEvent,
  isLifecycleEvent,
  extractEventBasics,
  fetchPrevAttemptRow,
  isOutOfOrder,
  isThisAttemptValidFinalize,
  buildUpsertAttemptDoc,
  upsertAttemptRow,
} from "../utils/quiz-event-utils";

import {
  stats_onAttemptFinalized,
  stats_onAttemptInvalidated,
  stats_onScheduleRemoved,
} from "./stats-controller";

/**
 * @route   POST /internal/quiz-events
 * @auth    x-quiz-secret header (S2S)
 * @input   Body: Lifecycle or Attempt event envelope
 * @logic   Middleware validates shared secret
 *          1) Idempotency: skip if eventId already processed
 *          2) If lifecycle: apply specific handler + record event
 *          3) If attempt: validate + upsert attempt + update stats + record event
 * @returns 200 { ok:true, applied?:boolean, message?:string }
 * @errors  400 invalid payload
 *          403 forbidden (invalid secret)
 *          500 internal
 */
export async function handleQuizEvent(req: Request, res: Response) {
  try {
    const evt = req.body;

    // 1) Basic payload + idempotency gate
    if (!evt || typeof evt.eventId !== "string") {
      return res.status(400).json({ ok: false, message: "Invalid payload" });
    }
    // check if we've already processed this eventId
    const already = await InboundQuizEventModel.findById(evt.eventId).lean();
    if (already)
      return res.status(200).json({ ok: true, message: "duplicate" });

    // 2) Lifecycle events ( QuizDeleted, QuizContentReset, QuizMetaUpdated )
    if (isLifecycleEvent(evt)) {
      let applied = false;
      let occurredAtISO: string;

      if (evt.type === "QuizDeleted") {
        applied = await applyQuizDeleted(evt.quizId);
        occurredAtISO = evt.deletedAt;
      } else if (evt.type === "QuizContentReset") {
        applied = await applyQuizContentReset(evt.quizId);
        occurredAtISO = evt.resetAt;
      } else if (evt.type === "QuizMetaUpdated") {
        // QuizMetaUpdated
        applied = await applyQuizMetaUpdated(evt.quizId, evt.meta);
        occurredAtISO = evt.occurredAt;
      } else {
        return res
          .status(400)
          .json({ ok: false, message: "Invalid event type" });
      }

      await InboundQuizEventModel.create({
        _id: evt.eventId,
        type: evt.type,
        attemptId: "n/a",
        occurredAt: new Date(occurredAtISO),
      });

      return res.status(200).json({ ok: true, applied });
    }

    // 3) Attempt events
    if (!isAttemptEvent(evt)) {
      return res.status(400).json({ ok: false, message: "Invalid payload" });
    }

    const applied = await applyAttemptEvent(evt);

    await InboundQuizEventModel.create({
      _id: evt.eventId,
      type: evt.type,
      attemptId: evt.attemptId,
      attemptVersion: evt.attemptVersion,
      occurredAt: new Date(evt.occurredAt),
    });

    return res.status(200).json({ ok: true, applied });
  } catch (e: any) {
    console.error("[quiz-events] error", e);
    const status = typeof e?.status === "number" ? e.status : 500;
    return res
      .status(status)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/** Internal Helper for applying an Attempt event */
async function applyAttemptEvent(evt: any): Promise<boolean> {
  // (1) Parse basics
  const {
    attemptVersion,
    quizId,
    classId,
    studentId,
    scheduleId,
    finishedAt,
    subject,
    score,
    maxScore,
  } = extractEventBasics(evt);

  // (2) Missing classId → keep audit rows but skip stats
  if (!classId) {
    console.warn("[quiz-events] classId missing; skipping stats");
    return false;
  }

  // (3) Version ordering (per attemptId)
  const prev = await fetchPrevAttemptRow(evt.attemptId);
  if (isOutOfOrder(prev, attemptVersion)) return false;

  // (4) Validity for finalize/edit
  const thisValidNow = isThisAttemptValidFinalize(evt.type, score, maxScore);

  // (5) Upsert class attempt audit row
  const upsertAttempt = buildUpsertAttemptDoc(
    evt,
    prev,
    attemptVersion,
    classId,
    studentId,
    subject,
    finishedAt,
    thisValidNow,
    score,
    maxScore
  );
  await upsertAttemptRow(evt.attemptId, upsertAttempt);

  // (6) Guard class existence for stats
  const classDoc = await ClassModel.findById(classId).select({ _id: 1 }).lean();
  if (!classDoc) {
    console.warn("[quiz-events] class not found:", classId);
    return false;
  }

  // (7) Stats updates
  if (evt.type === "AttemptFinalized" || evt.type === "AttemptEdited") {
    await stats_onAttemptFinalized({
      classId: String(classId),
      studentId: String(studentId),
      scheduleId: String(scheduleId),
      quizId: String(quizId),
      subject: subject ?? null,
      topic: evt.payload?.topic ?? null,
      score: score as number,
      maxScore: maxScore as number,
      finishedAt: finishedAt ?? new Date(),
      attemptId: evt.attemptId,
    });
  } else if (evt.type === "AttemptInvalidated") {
    await stats_onAttemptInvalidated({
      classId: String(classId),
      studentId: String(studentId),
      scheduleId: String(scheduleId),
      subject: subject ?? null,
      score: Number(score ?? 0),
      maxScore: Number(maxScore ?? 0),
    });
  }

  return true;
}

/**
 * Lifecycle: QuizDeleted
 * - Remove schedules referencing the quiz, delete mirrored attempts, adjust stats and assigned counts.
 */
async function applyQuizDeleted(quizId: string): Promise<boolean> {
  // 1) Locate affected classes
  const scheduled = await ClassModel.find({ "schedule.quizId": quizId })
    .select({ _id: 1, schedule: 1 })
    .lean<{ _id: Types.ObjectId; schedule: any[] }[]>();

  const attemptedClassIds = await ClassAttemptModel.distinct("classId", {
    quizId,
  });

  const classIds = new Set<string>([
    ...scheduled.map((c) => String(c._id)),
    ...attemptedClassIds.map(String),
  ]);
  if (classIds.size === 0) return false;

  // 2) Determine scheduleIds per class that will be removed
  const removedByClass: Record<string, string[]> = {};
  for (const c of scheduled) {
    const ids = (c.schedule || [])
      .filter((s: any) => String(s.quizId) === String(quizId))
      .map((s: any) => String(s._id));
    if (ids.length) removedByClass[String(c._id)] = ids;
  }

  // 3) Stats adjustments per class (must happen while schedule still exists)
  for (const classId of Object.keys(removedByClass)) {
    for (const scheduleId of removedByClass[classId]) {
      await stats_onScheduleRemoved(String(classId), String(scheduleId));
    }
  }

  // 4) Physically remove schedules + delete attempts
  await ClassModel.updateMany(
    { _id: { $in: Array.from(classIds) } },
    { $pull: { schedule: { quizId } }, $set: { updatedAt: new Date() } }
  );

  await ClassAttemptModel.deleteMany({ quizId });
  return true;
}

/**
 * Lifecycle: QuizContentReset
 * - Keep schedules; delete mirrored attempts; clear per-schedule stats and student canonicals.
 */
async function applyQuizContentReset(quizId: string): Promise<boolean> {
  const scheduled = await ClassModel.find({ "schedule.quizId": quizId })
    .select({ _id: 1, schedule: 1 })
    .lean<{ _id: Types.ObjectId; schedule: any[] }[]>();

  const anyAttempts = await ClassAttemptModel.exists({ quizId });
  if (!scheduled.length && !anyAttempts) return false;

  const affectedByClass: Record<string, string[]> = {};
  for (const c of scheduled) {
    const ids = (c.schedule || [])
      .filter((s: any) => String(s.quizId) === String(quizId))
      .map((s: any) => String(s._id));
    if (ids.length) affectedByClass[String(c._id)] = ids;
  }

  await ClassAttemptModel.deleteMany({ quizId });

  for (const classId of Object.keys(affectedByClass)) {
    for (const scheduleId of affectedByClass[classId]) {
      await stats_onScheduleRemoved(String(classId), scheduleId);
    }
  }

  return true;
}

/**
 * Lifecycle: QuizMetaUpdated
 * - Update mirrored schedule metadata (name/subject/color/topic). No stats changes.
 */
async function applyQuizMetaUpdated(
  quizId: string,
  meta: {
    name?: string;
    subject?: string;
    subjectColorHex?: string;
    topic?: string;
  }
): Promise<boolean> {
  const setPatch: Record<string, any> = {};
  if ("name" in meta) setPatch["schedule.$[it].quizName"] = meta.name;
  if ("subject" in meta) setPatch["schedule.$[it].subject"] = meta.subject;
  if ("subjectColorHex" in meta)
    setPatch["schedule.$[it].subjectColor"] = meta.subjectColorHex;
  if ("topic" in meta) setPatch["schedule.$[it].topic"] = meta.topic;

  if (!Object.keys(setPatch).length) return false;

  const res = await ClassModel.updateMany(
    { "schedule.quizId": quizId },
    { $set: { ...setPatch, updatedAt: new Date() } },
    { arrayFilters: [{ "it.quizId": quizId }] }
  );

  return (res?.modifiedCount || 0) > 0;
}
