import { model, models, Schema } from "mongoose";

type InboundCanonicalEventType = "CanonicalUpserted" | "CanonicalRemoved";

export interface InboundCanonicalEventDoc {
  _id: string;
  type: InboundCanonicalEventType;
  classId: string;
  studentId: string;
  scheduleId: string;
  occurredAt: Date;
  createdAt: Date;
}

const InboundCanonicalEventSchema = new Schema<InboundCanonicalEventDoc>({
  _id: { type: String, required: true },
  type: { type: String, required: true, index: true },
  classId: { type: String, required: true, index: true },
  studentId: { type: String, required: true, index: true },
  scheduleId: { type: String, required: true, index: true },
  occurredAt: { type: Date, required: true },
  createdAt: { type: Date, default: () => new Date() },
});

export const InboundCanonicalEventModel =
  models.GameInboundCanonicalEvent ||
  model<InboundCanonicalEventDoc>(
    "GameInboundCanonicalEvent",
    InboundCanonicalEventSchema
  );
