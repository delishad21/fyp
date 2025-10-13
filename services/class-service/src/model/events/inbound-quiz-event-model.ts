import { Schema, model, models, Document } from "mongoose";

/** Idempotency + audit of inbound quiz events (attempt + lifecycle) */
export interface InboundQuizEventDoc extends Document {
  _id: string; // eventId
  type:
    | "AttemptFinalized"
    | "AttemptEdited"
    | "AttemptInvalidated"
    | "QuizDeleted"
    | "QuizContentReset"
    | "QuizMetaUpdated";
  attemptId: string; // "n/a" for lifecycle events
  attemptVersion?: number;
  occurredAt: Date;
  createdAt: Date;
}

const InboundQuizEventSchema = new Schema<InboundQuizEventDoc>({
  _id: { type: String, required: true },
  type: { type: String, required: true },
  attemptId: { type: String, required: true, index: true },
  attemptVersion: { type: Number },
  occurredAt: { type: Date, required: true },
  createdAt: { type: Date, default: () => new Date() },
});

export const InboundQuizEventModel =
  models.InboundQuizEvent ||
  model<InboundQuizEventDoc>("InboundQuizEvent", InboundQuizEventSchema);
