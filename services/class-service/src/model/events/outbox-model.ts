// src/model/outbox-model.ts
import { Schema, model, models } from "mongoose";

/**
 * @model  OutboxEvent
 * @purpose Durable outbox for S2S events from Class Service (→ Kafka).
 * @notes  Event `_id` is the eventId (uuid) to guarantee idempotency/dedupe.
 */

export type OutboxStatus = "pending" | "publishing" | "published" | "dead";

export type OutboxEventType =
  | "AttemptFinalized"
  | "AttemptInvalidated"
  | "QuizDeleted"
  | "QuizVersionUpdated"
  | "QuizMetaUpdated"
  | "ScheduleUpdated";

export interface IOutboxEvent {
  _id: string; // eventId (uuid)
  type: OutboxEventType; // logical event type
  payload: any; // full event body posted to downstream consumers
  status: OutboxStatus; // delivery state machine
  attempts: number; // number of delivery attempts
  nextAttemptAt: Date; // when to try next (for backoff)
  createdAt: Date;
  updatedAt: Date;
}

export type OutboxLean = {
  _id: string;
  type: OutboxEventType;
  payload: any;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

const OutboxSchema = new Schema<IOutboxEvent>({
  _id: { type: String, required: true }, // eventId
  type: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, required: true },
  status: { type: String, required: true, index: true, default: "pending" },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: () => new Date() },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});

// Query pattern: pending + nextAttemptAt<=now ordered by createdAt.
OutboxSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });

// Different model name so it doesn’t clash if you ever share a connection.
export const OutboxModel =
  models.ClassOutboxEvent ||
  model<IOutboxEvent>("ClassOutboxEvent", OutboxSchema);
