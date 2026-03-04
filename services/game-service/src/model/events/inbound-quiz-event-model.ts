import { model, models, Schema } from "mongoose";

type InboundType = "AttemptFinalized" | "AttemptInvalidated";

export interface InboundQuizEventDoc {
  _id: string;
  type: InboundType;
  attemptId: string;
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
  models.GameInboundQuizEvent ||
  model<InboundQuizEventDoc>("GameInboundQuizEvent", InboundQuizEventSchema);
