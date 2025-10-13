import { Schema, model, models } from "mongoose";

/**
 * @model  OutboxEvent
 * @purpose Durable outbox for S2S events to the Class service.
 * @notes  Event `_id` is the eventId (uuid) to guarantee idempotency/dedupe.
 */

export type OutboxStatus = "pending" | "publishing" | "published" | "dead";

export type OutboxEventType =
  | "AttemptFinalized"
  | "AttemptEdited"
  | "AttemptInvalidated"
  | "QuizDeleted"
  | "QuizContentReset"
  | "QuizMetaUpdated";

export interface IOutboxEvent {
  _id: string; // eventId (uuid)
  type: OutboxEventType; // logical event type
  payload: any; // full event body posted to Class svc
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

export const OutboxModel =
  models.OutboxEvent || model<IOutboxEvent>("OutboxEvent", OutboxSchema);
