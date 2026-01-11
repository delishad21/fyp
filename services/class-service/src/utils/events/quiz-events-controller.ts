import { Request, Response } from "express";
import { Types } from "mongoose";
import { InboundQuizEventModel } from "../../model/events/inbound-quiz-event-model";
import { ClassModel } from "../../model/class/class-model";
import { ClassAttemptModel } from "../../model/events/class-attempt-model";

import {
  isAttemptEvent,
  isLifecycleEvent,
  extractEventBasics,
  fetchPrevAttemptRow,
  isOutOfOrder,
  isThisAttemptValidFinalize,
  buildUpsertAttemptDoc,
  upsertAttemptRow,
  BaseAttemptEvt,
} from "./quiz-event-utils";

import {
  stats_onAttemptFinalized,
  stats_onAttemptInvalidated,
  stats_onScheduleRemoved,
} from "../../controller/stats-controller";
import { emitScheduleUpdated } from "./schedule-events";
import { fetchQuizVersionsForRoot, QuizSvcBatchRow } from "../quiz-svc-client";

export async function handleQuizEvent(req: Request, res: Response) {
  try {
    const evt = req.body;

    console.log("[quiz-events] received event:", evt?.eventId, evt?.type);
    if (!evt || typeof evt.eventId !== "string") {
      return res.status(400).json({ ok: false, message: "Invalid payload" });
    }
    const already = await InboundQuizEventModel.findById(evt.eventId).lean();
    if (already)
      return res.status(200).json({ ok: true, message: "duplicate" });

    // Lifecycle (QuizDeleted | QuizMetaUpdated | QuizVersionUpdated)
    if (isLifecycleEvent(evt)) {
      let applied = false;
      let occurredAtISO: string;

      if (evt.type === "QuizDeleted") {
        applied = await applyQuizDeleted(evt.quizId); // quizId == root id
        occurredAtISO = evt.deletedAt;
      } else if (evt.type === "QuizVersionUpdated") {
        applied = await applyQuizVersionUpdated(
          evt.quizId, // root id
          evt.previousVersion,
          evt.newVersion,
          evt.updatedAt
        );
        occurredAtISO = evt.updatedAt;
      } else if (evt.type === "QuizMetaUpdated") {
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

    // Attempt events
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
async function applyAttemptEvent(evt: BaseAttemptEvt): Promise<boolean> {
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

  if (!classId) {
    console.warn("[quiz-events] classId missing; skipping stats");
    return false;
  }

  const prev = await fetchPrevAttemptRow(evt.attemptId);
  if (isOutOfOrder(prev, attemptVersion)) return false;

  const thisValidNow = isThisAttemptValidFinalize(evt.type, score, maxScore);

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

  const classDoc = await ClassModel.findById(classId).select({ _id: 1 }).lean();
  if (!classDoc) {
    console.warn("[quiz-events] class not found:", classId);
    return false;
  }

  if (evt.type === "AttemptFinalized") {
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

async function applyQuizDeleted(quizRootId: string): Promise<boolean> {
  const scheduled = await ClassModel.find({ "schedule.quizRootId": quizRootId })
    .select({ _id: 1, schedule: 1 })
    .lean<{ _id: Types.ObjectId; schedule: any[] }[]>();

  const attemptedClassIds = await ClassAttemptModel.distinct("classId", {
    quizRootId,
  });

  const classIds = new Set<string>([
    ...scheduled.map((c) => String(c._id)),
    ...attemptedClassIds.map(String),
  ]);
  if (!classIds.size) return false;

  const removedByClass: Record<string, string[]> = {};
  for (const c of scheduled) {
    const ids = (c.schedule || [])
      .filter((s: any) => String(s.quizRootId) === String(quizRootId))
      .map((s: any) => String(s._id));
    if (ids.length) removedByClass[String(c._id)] = ids;
  }

  // adjust stats while schedules still exist
  for (const classId of Object.keys(removedByClass)) {
    for (const scheduleId of removedByClass[classId]) {
      await stats_onScheduleRemoved(String(classId), String(scheduleId));
    }
  }

  // remove schedules & mirrored attempts by FAMILY
  await ClassModel.updateMany(
    { _id: { $in: Array.from(classIds) } },
    { $pull: { schedule: { quizRootId } }, $set: { updatedAt: new Date() } }
  );

  await ClassAttemptModel.deleteMany({ quizRootId });
  return true;
}

async function applyQuizMetaUpdated(
  quizRootId: string,
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
    { "schedule.quizRootId": quizRootId },
    { $set: { ...setPatch, updatedAt: new Date() } },
    { arrayFilters: [{ "it.quizRootId": quizRootId }] }
  );

  return (res?.modifiedCount || 0) > 0;
}

/**
 * Lifecycle: QuizVersionUpdated
 * - For schedules under this root that are ONGOING or FUTURE (endDate >= now)
 *   and whose version differs, set quizVersion = newVersion and emit ScheduleUpdated.
 */
async function applyQuizVersionUpdated(
  quizRootId: string,
  previousVersion: number,
  newVersion: number,
  updatedAtISO: string
): Promise<boolean> {
  const now = new Date();

  // 1) Resolve the concrete quizId for (root, newVersion)
  const { versions } = await fetchQuizVersionsForRoot(quizRootId);
  const match = (versions || []).find(
    (v: QuizSvcBatchRow) => v.version === newVersion
  );

  if (!match) {
    console.warn(
      `[applyQuizVersionUpdated] No quiz version ${newVersion} found for root ${quizRootId}`
    );
    // we can't safely bump quizId; bail out
    return false;
  }

  const newQuizId = String(match._id);

  // 2) Find classes with schedules under this root
  const classes = await ClassModel.find({ "schedule.quizRootId": quizRootId })
    .select({ _id: 1, schedule: 1 })
    .lean<{ _id: Types.ObjectId; schedule: any[] }[]>();

  let changed = 0;

  for (const klass of classes) {
    const toBump = (klass.schedule || []).filter(
      (s: any) =>
        String(s.quizRootId) === quizRootId && new Date(s.endDate) >= now
    );
    if (!toBump.length) continue;

    await ClassModel.updateOne(
      { _id: klass._id },
      {
        $set: {
          "schedule.$[it].quizVersion": newVersion,
          "schedule.$[it].quizId": newQuizId, // 🔴 new line
          updatedAt: new Date(updatedAtISO),
        },
      },
      { arrayFilters: [{ "it._id": { $in: toBump.map((s: any) => s._id) } }] }
    );

    // Emit SCHEDULE UPDATED (version_bumped) per schedule
    for (const s of toBump) {
      await emitScheduleUpdated({
        classId: String(klass._id),
        scheduleId: String(s._id),
        quizRootId,
        action: "version_bumped",
        previousVersion,
        newVersion,
        occurredAt: updatedAtISO,
      });
    }

    changed += toBump.length;
  }

  return changed > 0;
}
