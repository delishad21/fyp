import { model, Schema, Types } from "mongoose";

export interface IGameStudentStats {
  classId: Types.ObjectId;
  studentId: string;

  overallScore: number;

  streakDays: number;
  bestStreakDays: number;
  lastStreakDate?: Date | null;

  attendanceDays: Map<string, boolean>;

  canonicalBySchedule: Map<
    string,
    {
      attemptId: string;
      score: number;
      maxScore: number;
      finishedAt: Date;
      subject?: string;
      topic?: string;
    }
  >;

  version: number;
  updatedAt: Date;
}

const GameStudentStatsSchema = new Schema<IGameStudentStats>(
  {
    classId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    studentId: { type: String, required: true, index: true },

    overallScore: { type: Number, default: 0 },

    streakDays: { type: Number, default: 0 },
    bestStreakDays: { type: Number, default: 0 },
    lastStreakDate: { type: Date, default: null },

    attendanceDays: {
      type: Map,
      of: Boolean,
      default: {},
    },

    canonicalBySchedule: {
      type: Map,
      of: new Schema(
        {
          attemptId: { type: String, required: true },
          score: { type: Number, required: true },
          maxScore: { type: Number, required: true },
          finishedAt: { type: Date, required: true },
          subject: { type: String, required: false },
          topic: { type: String, required: false },
        },
        { _id: false }
      ),
      default: {},
    },

    version: { type: Number, default: 0 },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);

GameStudentStatsSchema.index({ classId: 1, studentId: 1 }, { unique: true });
GameStudentStatsSchema.index(
  { classId: 1, overallScore: -1, streakDays: -1, studentId: 1 },
  { name: "leaderboard_idx" }
);

export const GameStudentStatsModel = model<IGameStudentStats>(
  "GameStudentStats",
  GameStudentStatsSchema
);
