import { model, models, Schema, Types } from "mongoose";

export interface IGameRewardGrant {
  classId: string;
  studentId: string;
  rewardId: string;
  rewardType: "cosmetic" | "badge";
  source: "rule" | "teacher" | "score_threshold";
  ruleId?: Types.ObjectId | null;
  thresholdPoints?: number | null;
  triggerAttemptId?: string | null;
  grantedAt: Date;
  acknowledgedAt?: Date | null;
  metadata?: Record<string, unknown>;
}

const GameRewardGrantSchema = new Schema<IGameRewardGrant>(
  {
    classId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    rewardId: { type: String, required: true, index: true },
    rewardType: {
      type: String,
      required: true,
      enum: ["cosmetic", "badge"],
    },
    source: {
      type: String,
      required: true,
      enum: ["rule", "teacher", "score_threshold"],
    },
    ruleId: { type: Schema.Types.ObjectId, required: false, default: null },
    thresholdPoints: { type: Number, required: false, default: null },
    triggerAttemptId: { type: String, required: false, default: null, index: true },
    grantedAt: { type: Date, default: () => new Date() },
    acknowledgedAt: { type: Date, required: false, default: null, index: true },
    metadata: { type: Schema.Types.Mixed, required: false, default: {} },
  },
  { timestamps: false }
);

GameRewardGrantSchema.index({ classId: 1, studentId: 1, grantedAt: -1 });
GameRewardGrantSchema.index(
  { classId: 1, studentId: 1, source: 1, thresholdPoints: 1 },
  {
    unique: true,
    partialFilterExpression: {
      source: "score_threshold",
      thresholdPoints: { $exists: true, $ne: null, $type: "number" },
    },
  }
);
GameRewardGrantSchema.index(
  { classId: 1, studentId: 1, rewardId: 1, ruleId: 1 },
  {
    unique: true,
    partialFilterExpression: { ruleId: { $exists: true, $ne: null } },
  }
);

export const GameRewardGrantModel =
  models.GameRewardGrant ||
  model<IGameRewardGrant>("GameRewardGrant", GameRewardGrantSchema);
