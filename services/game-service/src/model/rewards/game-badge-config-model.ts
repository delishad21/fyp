import { model, models, Schema } from "mongoose";

export interface IGameBadgeConfig {
  classId: string;
  weeklyTopEnabled: boolean;
  monthlyTopEnabled: boolean;
  overallScoreThresholdEnabled: boolean;
  streakThresholdEnabled: boolean;
  overallScoreThresholdStep: number;
  streakThresholdStep: number;
  updatedAt: Date;
  updatedBy?: string | null;
}

const GameBadgeConfigSchema = new Schema<IGameBadgeConfig>(
  {
    classId: { type: String, required: true, unique: true, index: true },
    weeklyTopEnabled: { type: Boolean, required: true, default: false },
    monthlyTopEnabled: { type: Boolean, required: true, default: true },
    overallScoreThresholdEnabled: { type: Boolean, required: true, default: true },
    streakThresholdEnabled: { type: Boolean, required: true, default: true },
    overallScoreThresholdStep: { type: Number, required: true, default: 1000, min: 1 },
    streakThresholdStep: { type: Number, required: true, default: 25, min: 1 },
    updatedAt: { type: Date, required: true, default: () => new Date() },
    updatedBy: { type: String, required: false, default: null },
  },
  { timestamps: false }
);

export const GameBadgeConfigModel =
  models.GameBadgeConfig ||
  model<IGameBadgeConfig>("GameBadgeConfig", GameBadgeConfigSchema);
