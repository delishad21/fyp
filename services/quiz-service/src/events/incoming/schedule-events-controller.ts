import { Types } from "mongoose";
import { ScheduleUpdatedEvent } from "../types";
import { AttemptModel } from "../../model/quiz-attempt-model";
import { buildAttemptEvent } from "../outgoing/attempt-events";
import { enqueueEvent } from "../outgoing/outbox-enqueue";
import { purgeScheduleVariants } from "../../utils/schedule-quiz-variant-utils";

/**
 * Handle ScheduleUpdatedEvent from class-service.
 *
 * Rules:
 * - action === "version_bumped":
 *      Invalidate all non-invalidated attempts for this schedule that were
 *      taken against the *previous* quizVersion (if provided).
 * - action === "deleted":
 *      Invalidate ALL non-invalidated attempts for this schedule (any version).
 *
 * In both cases we emit AttemptInvalidated events so class-service can
 * unwind stats for finalized attempts. For in-progress ones, the event
 * is effectively a no-op on class-service (it never saw them).
 */

export async function handleScheduleUpdated(evt: ScheduleUpdatedEvent) {
  const scheduleObjectId = new Types.ObjectId(evt.scheduleId);

  console.log(
    `[schedule-updated-handler] handling schedule update: ${evt.action} for schedule ${evt.scheduleId}`
  );

  const filter: any = {
    scheduleId: scheduleObjectId,
    state: { $ne: "invalidated" },
  };

  if (evt.quizRootId) {
    filter.quizRootId = new Types.ObjectId(evt.quizRootId);
  }

  if (evt.action === "version_bumped") {
    if (typeof evt.previousVersion === "number") {
      filter.quizVersion = evt.previousVersion;
    }
  } else if (evt.action === "deleted") {
    // all versions for this schedule get invalidated, no extra filter
  } else {
    return;
  }

  // Schedule-anchored randomized variants must be purged when schedules change.
  if (evt.action === "deleted") {
    await purgeScheduleVariants({
      scheduleId: evt.scheduleId,
      quizRootId: evt.quizRootId ?? null,
    });
  } else if (evt.action === "version_bumped") {
    await purgeScheduleVariants({
      scheduleId: evt.scheduleId,
      quizRootId: evt.quizRootId ?? null,
      quizVersion:
        typeof evt.previousVersion === "number" ? evt.previousVersion : null,
    });
  }

  const attempts = await AttemptModel.find(filter).lean();

  for (const a of attempts) {
    const updated = await AttemptModel.findByIdAndUpdate(
      a._id,
      {
        $set: { state: "invalidated" as const },
        $inc: { attemptVersion: 1 },
      },
      { new: true }
    ).lean();

    if (!updated) continue;

    const event = buildAttemptEvent({
      type: "AttemptInvalidated",
      attemptId: String(updated._id),
      attemptVersion: updated.attemptVersion ?? 1,
      quizId: String(updated.quizId),
      quizRootId: String(updated.quizRootId),
      quizVersion: updated.quizVersion,
      classId: updated.classId ? String(updated.classId) : null,
      scheduleId: updated.scheduleId ? String(updated.scheduleId) : "",
      studentId: String(updated.studentId),
      startedAt: updated.startedAt ?? undefined,
      finishedAt: updated.finishedAt ?? undefined,
      score: updated.score,
      maxScore: updated.maxScore,
    });

    await enqueueEvent("AttemptInvalidated", event);
  }
}
