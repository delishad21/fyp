import { InboundCanonicalEventModel } from "../model/events/inbound-canonical-event-model";
import { CanonicalEvent } from "./types";
import {
  game_onCanonicalRemoved,
  game_onCanonicalUpserted,
} from "./projection-controller";

export type HandleCanonicalEventResult = {
  handled: boolean;
  applied: boolean;
  reason?: string;
};

function isCanonicalEvent(payload: any): payload is CanonicalEvent {
  if (!payload || typeof payload !== "object") return false;
  if (typeof payload.eventId !== "string") return false;
  if (typeof payload.type !== "string") return false;
  if (typeof payload.classId !== "string") return false;
  if (typeof payload.studentId !== "string") return false;
  if (typeof payload.scheduleId !== "string") return false;
  if (typeof payload.occurredAt !== "string") return false;

  if (payload.type === "CanonicalUpserted") {
    return (
      payload.canonical &&
      typeof payload.canonical === "object" &&
      typeof payload.canonical.attemptId === "string" &&
      typeof payload.canonical.score === "number" &&
      typeof payload.canonical.maxScore === "number" &&
      typeof payload.canonical.finishedAt === "string"
    );
  }

  if (payload.type === "CanonicalRemoved") {
    return true;
  }

  return false;
}

async function applyCanonicalEvent(payload: CanonicalEvent): Promise<boolean> {
  if (payload.type === "CanonicalUpserted") {
    await game_onCanonicalUpserted({
      classId: payload.classId,
      studentId: payload.studentId,
      scheduleId: payload.scheduleId,
      canonical: {
        attemptId: payload.canonical.attemptId,
        score: Number(payload.canonical.score),
        maxScore: Number(payload.canonical.maxScore),
        finishedAt: new Date(payload.canonical.finishedAt),
        ...(payload.canonical.subject
          ? { subject: String(payload.canonical.subject) }
          : {}),
        ...(payload.canonical.topic ? { topic: String(payload.canonical.topic) } : {}),
      },
    });
    return true;
  }

  if (payload.type === "CanonicalRemoved") {
    await game_onCanonicalRemoved({
      classId: payload.classId,
      studentId: payload.studentId,
      scheduleId: payload.scheduleId,
    });
    return true;
  }

  return false;
}

export async function handleCanonicalEvent(
  payload: any
): Promise<HandleCanonicalEventResult> {
  if (!isCanonicalEvent(payload)) {
    return { handled: false, applied: false, reason: "invalid_payload" };
  }

  const already = await InboundCanonicalEventModel.findById(payload.eventId).lean();
  if (already) {
    return { handled: true, applied: false, reason: "duplicate_event" };
  }

  const applied = await applyCanonicalEvent(payload);

  try {
    await InboundCanonicalEventModel.create({
      _id: payload.eventId,
      type: payload.type,
      classId: payload.classId,
      studentId: payload.studentId,
      scheduleId: payload.scheduleId,
      occurredAt: new Date(payload.occurredAt),
    });
  } catch (e: any) {
    if (e?.code !== 11000) {
      throw e;
    }
  }

  return { handled: true, applied };
}
