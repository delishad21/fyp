import { model, models, Schema } from "mongoose";

type InboundClassEventType =
  | "ClassCreated"
  | "ClassUpdated"
  | "ClassDeleted"
  | "StudentAddedToClass"
  | "StudentRemovedFromClass"
  | "ScheduleCreated"
  | "ScheduleUpdated"
  | "ScheduleDeleted";

export interface InboundClassEventDoc {
  _id: string;
  type: InboundClassEventType;
  classId: string;
  occurredAt: Date;
  createdAt: Date;
}

const InboundClassEventSchema = new Schema<InboundClassEventDoc>({
  _id: { type: String, required: true },
  type: { type: String, required: true, index: true },
  classId: { type: String, required: true, index: true },
  occurredAt: { type: Date, required: true },
  createdAt: { type: Date, default: () => new Date() },
});

export const InboundClassEventModel =
  models.GameInboundClassEvent ||
  model<InboundClassEventDoc>("GameInboundClassEvent", InboundClassEventSchema);
