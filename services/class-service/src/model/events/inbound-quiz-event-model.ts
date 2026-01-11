import { Schema, model, models, Document } from "mongoose";

// type union:
type InboundType =
  | "AttemptFinalized"
  | "AttemptInvalidated"
  | "QuizDeleted"
  | "QuizMetaUpdated"
  | "QuizVersionUpdated";

export interface InboundQuizEventDoc extends Document {
  _id: string; // eventId
  type: InboundType;
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
