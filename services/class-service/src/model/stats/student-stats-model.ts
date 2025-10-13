import { model, Schema, Types } from "mongoose";
import { StatsBucketSchema } from "./stats-bucket-model";

/** Per-student, per-class aggregates (authoritative for leaderboard) */
export interface IStudentClassStats {
  classId: Types.ObjectId;
  studentId: string;

  sumScore: number;
  sumMax: number;
  participationCount: number;

  /**
   * Last earned streak (the run length as of the most recent attended day).
   * On reads, the "current" streak is projected to 0 if lastStreakDate is
   * neither today nor yesterday in the class timezone.
   */
  streakDays: number;

  /** Historic personal best streak (max consecutive days ever achieved). */
  bestStreakDays: number;

  /** UTC timestamp pointing to the most recent attended local day. */
  lastStreakDate?: Date;
  overallScore: number;

  /** Per-schedule canonical attempt (best score); used for leaderboard + weighting */
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

  /** Daily attendance ledger (class-local YYYY-MM-DD keys). Append-only. */
  attendanceDays: Map<string, boolean>;

  /** Buckets for analytics */
  bySubject: Map<
    string,
    { sumScore: number; sumMax: number; attempts: number }
  >;
  byTopic: Map<string, { sumScore: number; sumMax: number; attempts: number }>;

  version: number;
  updatedAt: Date;
}

const StudentClassStatsSchema = new Schema<IStudentClassStats>(
  {
    classId: {
      type: Schema.Types.ObjectId,
      ref: "Class",
      index: true,
      required: true,
    },
    studentId: { type: String, index: true, required: true },

    sumScore: { type: Number, default: 0 },
    sumMax: { type: Number, default: 0 },
    participationCount: { type: Number, default: 0 },

    // Stored "last earned" streak; projected to 0 on reads when stale.
    streakDays: { type: Number, default: 0 },

    // Historic personal best.
    bestStreakDays: { type: Number, default: 0 },

    // Stable marker for the most recent attended local day.
    lastStreakDate: { type: Date, default: null },

    overallScore: { type: Number, default: 0 },

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

    attendanceDays: {
      type: Map,
      of: Boolean,
      default: {},
    },

    bySubject: { type: Map, of: StatsBucketSchema, default: {} },
    byTopic: { type: Map, of: StatsBucketSchema, default: {} },

    version: { type: Number, default: 0 },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);

// Composite unique per class+student; leaderboard index helps sort/rank queries
StudentClassStatsSchema.index({ classId: 1, studentId: 1 }, { unique: true });
StudentClassStatsSchema.index(
  // you can keep this; projected streak is only used at read time
  { classId: 1, overallScore: -1, streakDays: -1, studentId: 1 },
  { name: "leaderboard_idx" }
);

export const StudentClassStatsModel = model<IStudentClassStats>(
  "StudentClassStats",
  StudentClassStatsSchema
);
