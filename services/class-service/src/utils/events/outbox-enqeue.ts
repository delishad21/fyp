import { OutboxEventType, OutboxModel } from "../../model/events/outbox-model";

/**
 * @func    enqueueEvent
 * @input   type: OutboxEventType, payload: { eventId: string, ... }
 * @returns Promise<void>
 * @purpose Persist a new outbox record (idempotent via eventId as _id).
 * @notes   Duplicate eventIds are ignored (dedupe).
 */
export async function enqueueEvent(type: OutboxEventType, payload: any) {
  try {
    await OutboxModel.create({
      _id: payload.eventId, // eventId as _id for dedupe safety
      type,
      payload,
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date(),
    });
  } catch (e: any) {
    // If the same eventId was already enqueued, treat as success.
    if (e?.code === 11000) return;
    throw e;
  }
}
