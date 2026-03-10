import { model, models, Schema, Types } from "mongoose";
import { RewardRuleTriggerType } from "../../rewards/default-catalog";

export interface IGameRewardRule {
  classId: string;
  key?: string;
  name: string;
  description?: string;
  triggerType: RewardRuleTriggerType;
  threshold: number;
  rewardIds: string[];
  enabled: boolean;
  repeatable: boolean;
  source: "default" | "custom";
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const GameRewardRuleSchema = new Schema<IGameRewardRule>(
  {
    classId: { type: String, required: true, index: true },
    key: { type: String, required: false },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: false, default: "" },
    triggerType: {
      type: String,
      required: true,
      enum: [
        "overall_score_gte",
        "best_streak_gte",
        "participation_count_gte",
      ] satisfies RewardRuleTriggerType[],
    },
    threshold: { type: Number, required: true, min: 0, default: 0 },
    rewardIds: {
      type: [String],
      required: true,
      default: [],
    },
    enabled: { type: Boolean, required: true, default: true },
    repeatable: { type: Boolean, required: true, default: false },
    source: {
      type: String,
      required: true,
      enum: ["default", "custom"],
      default: "custom",
    },
    createdBy: { type: String, required: false, default: null },
    updatedBy: { type: String, required: false, default: null },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);

GameRewardRuleSchema.index({ classId: 1, enabled: 1 });
GameRewardRuleSchema.index(
  { classId: 1, key: 1 },
  {
    unique: true,
    partialFilterExpression: { key: { $exists: true, $type: "string" } },
  }
);

export const GameRewardRuleModel =
  models.GameRewardRule ||
  model<IGameRewardRule>("GameRewardRule", GameRewardRuleSchema);
