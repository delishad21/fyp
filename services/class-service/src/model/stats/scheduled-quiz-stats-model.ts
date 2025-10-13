import { model, Schema, Types } from "mongoose";

export interface IScheduleStats {
  classId: Types.ObjectId;
  scheduleId: Types.ObjectId; // unique per schedule
  quizId: string;

  participants: number; // distinct students with canonical
  sumScore: number; // sum of canonical scores
  sumMax: number; // sum of canonical max

  version: number;
  updatedAt: Date;
}

const ScheduleStatsSchema = new Schema<IScheduleStats>({
  classId: {
    type: Schema.Types.ObjectId,
    ref: "Class",
    index: true,
    required: true,
  },
  scheduleId: {
    type: Schema.Types.ObjectId,
    index: true,
    required: true,
    unique: true,
  },
  quizId: { type: String, index: true, required: true },

  participants: { type: Number, default: 0 },
  sumScore: { type: Number, default: 0 },
  sumMax: { type: Number, default: 0 },

  version: { type: Number, default: 0 },
  updatedAt: { type: Date, default: () => new Date() },
});

// Helpful indexes for list pages and quick filters
ScheduleStatsSchema.index({ classId: 1, updatedAt: -1 });
ScheduleStatsSchema.index({ classId: 1, quizId: 1 });
ScheduleStatsSchema.index({ quizId: 1, updatedAt: -1 });

export const ScheduleStatsModel = model<IScheduleStats>(
  "ScheduleStats",
  ScheduleStatsSchema
);
