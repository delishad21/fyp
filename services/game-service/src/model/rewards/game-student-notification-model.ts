import { model, models, Schema } from "mongoose";

export type GameStudentNotificationType = "reward_granted" | "reward_revoked";
export type GameStudentNotificationSource =
  | "teacher"
  | "rule"
  | "score_threshold"
  | "system";

export interface IGameStudentNotification {
  classId: string;
  studentId: string;
  type: GameStudentNotificationType;
  source: GameStudentNotificationSource;
  rewardId?: string | null;
  rewardType?: "cosmetic" | "badge" | null;
  triggerAttemptId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  acknowledgedAt?: Date | null;
}

const GameStudentNotificationSchema = new Schema<IGameStudentNotification>(
  {
    classId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: ["reward_granted", "reward_revoked"],
    },
    source: {
      type: String,
      required: true,
      enum: ["teacher", "rule", "score_threshold", "system"],
    },
    rewardId: { type: String, required: false, default: null },
    rewardType: {
      type: String,
      required: false,
      default: null,
      enum: ["cosmetic", "badge"],
    },
    triggerAttemptId: { type: String, required: false, default: null, index: true },
    metadata: { type: Schema.Types.Mixed, required: false, default: {} },
    createdAt: { type: Date, required: true, default: () => new Date() },
    acknowledgedAt: { type: Date, required: false, default: null, index: true },
  },
  { timestamps: false }
);

GameStudentNotificationSchema.index({ classId: 1, studentId: 1, createdAt: -1 });
GameStudentNotificationSchema.index({
  classId: 1,
  studentId: 1,
  acknowledgedAt: 1,
  createdAt: -1,
});

export const GameStudentNotificationModel =
  models.GameStudentNotification ||
  model<IGameStudentNotification>(
    "GameStudentNotification",
    GameStudentNotificationSchema
  );
