import { model, models, Schema } from "mongoose";

export interface IGameScoreRewardConfig {
  classId: string;
  enabled: boolean;
  pointsPerReward: number;
  updatedAt: Date;
  updatedBy?: string | null;
}

const GameScoreRewardConfigSchema = new Schema<IGameScoreRewardConfig>(
  {
    classId: { type: String, required: true, index: true },
    enabled: { type: Boolean, required: true, default: true },
    pointsPerReward: { type: Number, required: true, min: 1, default: 500 },
    updatedAt: { type: Date, default: () => new Date() },
    updatedBy: { type: String, required: false, default: null },
  },
  { timestamps: false }
);

GameScoreRewardConfigSchema.index({ classId: 1 }, { unique: true });

export const GameScoreRewardConfigModel =
  models.GameScoreRewardConfig ||
  model<IGameScoreRewardConfig>(
    "GameScoreRewardConfig",
    GameScoreRewardConfigSchema
  );

