import { model, models, Schema } from "mongoose";

export interface IGameClassState {
  classId: string;
  name: string;
  timezone: string;
  students: Map<string, boolean>;
  schedules: Map<
    string,
    {
      quizRootId: string;
      quizVersion: number;
      contribution: number;
      startDate: Date;
      endDate: Date;
    }
  >;
  version: number;
  updatedAt: Date;
}

const ScheduleStateSchema = new Schema(
  {
    quizRootId: { type: String, required: true },
    quizVersion: { type: Number, required: true },
    contribution: { type: Number, required: true, default: 100 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
  },
  { _id: false }
);

const GameClassStateSchema = new Schema<IGameClassState>(
  {
    classId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, default: "" },
    timezone: { type: String, required: true, default: "Asia/Singapore" },
    students: {
      type: Map,
      of: Boolean,
      default: {},
    },
    schedules: {
      type: Map,
      of: ScheduleStateSchema,
      default: {},
    },
    version: { type: Number, default: 0 },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);

export const GameClassStateModel =
  models.GameClassState ||
  model<IGameClassState>("GameClassState", GameClassStateSchema);
