import { model, models, Schema } from "mongoose";

export interface IGameBadgePeriodAward {
  classId: string;
  periodType: "week" | "month";
  periodKey: string;
  winners: string[];
  awardedAt: Date;
}

const GameBadgePeriodAwardSchema = new Schema<IGameBadgePeriodAward>(
  {
    classId: { type: String, required: true, index: true },
    periodType: { type: String, required: true, enum: ["week", "month"] },
    periodKey: { type: String, required: true },
    winners: { type: [String], required: true, default: [] },
    awardedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: false }
);

GameBadgePeriodAwardSchema.index(
  { classId: 1, periodType: 1, periodKey: 1 },
  { unique: true }
);

export const GameBadgePeriodAwardModel =
  models.GameBadgePeriodAward ||
  model<IGameBadgePeriodAward>("GameBadgePeriodAward", GameBadgePeriodAwardSchema);
