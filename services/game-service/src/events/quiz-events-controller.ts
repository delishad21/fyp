import { InboundQuizEventModel } from "../model/events/inbound-quiz-event-model";
import {
  buildUpsertAttemptDoc,
  fetchPrevAttemptRow,
  isAttemptEvent,
  isOutOfOrder,
  isThisAttemptValidFinalize,
  upsertAttemptRow,
} from "./quiz-event-utils";

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

  // Projection updates (streak/leaderboard/score) will be added in next commit.
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
