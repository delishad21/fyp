import { InboundQuizEventModel } from "../model/events/inbound-quiz-event-model";
import {
  buildUpsertAttemptDoc,
  fetchPrevAttemptRow,
  isAttemptEvent,
  isOutOfOrder,
  isThisAttemptValidFinalize,
  upsertAttemptRow,
} from "./quiz-event-utils";
import {
  game_onAttemptFinalized,
  game_onAttemptInvalidated,
} from "./projection-controller";

export type HandleQuizAttemptEventResult = {
  handled: boolean;
  applied: boolean;
  reason?: string;
};

async function applyAttemptEvent(evt: any): Promise<boolean> {
  if (!isAttemptEvent(evt)) return false;

  if (!evt.classId) {
    // Non-class attempt; no game projection to maintain.
    return false;
  }

  const prev = await fetchPrevAttemptRow(evt.attemptId);
  const attemptVersion =
    typeof evt.attemptVersion === "number" ? evt.attemptVersion : 1;

  if (isOutOfOrder(prev, attemptVersion)) {
    return false;
  }

  const thisValidNow = isThisAttemptValidFinalize(
    evt.type,
    evt.payload?.score,
    evt.payload?.maxScore
  );

  const upsertAttempt = buildUpsertAttemptDoc(evt, prev, thisValidNow);
  await upsertAttemptRow(evt.attemptId, upsertAttempt);

  const classId = String(evt.classId);
  const studentId = String(evt.studentId);
  const scheduleId = String(evt.scheduleId);
  const attemptId = String(evt.attemptId);

  if (evt.type === "AttemptFinalized" && thisValidNow) {
    const attemptVersion =
      typeof evt.attemptVersion === "number" ? evt.attemptVersion : 1;
    const score = Number(evt.payload?.score);
    const maxScore = Number(evt.payload?.maxScore);
    const finishedAt = evt.payload?.finishedAt
      ? new Date(evt.payload.finishedAt)
      : new Date();
    const subject =
      typeof evt.payload?.subject === "string" ? evt.payload.subject : undefined;
    const topic =
      typeof evt.payload?.topic === "string" ? evt.payload.topic : undefined;

    await game_onAttemptFinalized({
      classId,
      studentId,
      scheduleId,
      attemptId,
      attemptVersion,
      score,
      maxScore,
      finishedAt,
      subject,
      topic,
    });
  } else if (evt.type === "AttemptInvalidated") {
    await game_onAttemptInvalidated({
      classId,
      studentId,
      scheduleId,
      attemptId,
    });
  }

  return true;
}

export async function handleQuizAttemptEvent(
  payload: any
): Promise<HandleQuizAttemptEventResult> {
  if (!isAttemptEvent(payload)) {
    return { handled: false, applied: false, reason: "invalid_payload" };
  }

  const already = await InboundQuizEventModel.findById(payload.eventId).lean();
  if (already) {
    return { handled: true, applied: false, reason: "duplicate_event" };
  }

  const applied = await applyAttemptEvent(payload);

  try {
    await InboundQuizEventModel.create({
      _id: payload.eventId,
      type: payload.type,
      attemptId: payload.attemptId,
      attemptVersion: payload.attemptVersion,
      occurredAt: new Date(payload.occurredAt),
    });
  } catch (e: any) {
    if (e?.code !== 11000) {
      throw e;
    }
  }

  return { handled: true, applied };
}
