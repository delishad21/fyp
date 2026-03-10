import { model, models, Schema } from "mongoose";
import type { CosmeticSlot } from "../../rewards/default-catalog";
import type { AvatarComposition } from "../../rewards/avatar-generator";

export type EquippedSlotsRecord = Record<CosmeticSlot, string | null>;

export interface IGameStudentInventory {
  classId: string;
  studentId: string;
  ownedCosmeticIds: string[];
  ownedBadgeIds: string[];
  displayBadgeIds: string[];
  equipped: EquippedSlotsRecord;
  scoreThresholdProgress?: {
    pointsPerReward: number;
    nextThresholdPoints: number;
  } | null;
  avatarUrl: string | null;
  avatarSpec: AvatarComposition | null;
  updatedAt: Date;
}

const GameStudentInventorySchema = new Schema<IGameStudentInventory>(
  {
    classId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    ownedCosmeticIds: {
      type: [String],
      required: true,
      default: [],
    },
    ownedBadgeIds: {
      type: [String],
      required: true,
      default: [],
    },
    displayBadgeIds: {
      type: [String],
      required: true,
      default: [],
    },
    equipped: {
      avatar: { type: String, required: false, default: null },
      eyes: { type: String, required: false, default: null },
      mouth: { type: String, required: false, default: null },
      upperwear: { type: String, required: false, default: null },
      lowerwear: { type: String, required: false, default: null },
      hair: { type: String, required: false, default: null },
      outerwear: { type: String, required: false, default: null },
      head_accessory: { type: String, required: false, default: null },
      eye_accessory: { type: String, required: false, default: null },
      wrist_accessory: { type: String, required: false, default: null },
      pet: { type: String, required: false, default: null },
      shoes: { type: String, required: false, default: null },
    },
    scoreThresholdProgress: {
      pointsPerReward: { type: Number, required: false, default: null },
      nextThresholdPoints: { type: Number, required: false, default: null },
    },
    avatarUrl: { type: String, required: false, default: null },
    avatarSpec: { type: Schema.Types.Mixed, required: false, default: null },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);

GameStudentInventorySchema.index({ classId: 1, studentId: 1 }, { unique: true });
GameStudentInventorySchema.index({ classId: 1, updatedAt: -1 });

export const GameStudentInventoryModel =
  models.GameStudentInventory ||
  model<IGameStudentInventory>("GameStudentInventory", GameStudentInventorySchema);
