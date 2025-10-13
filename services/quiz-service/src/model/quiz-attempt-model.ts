import { Schema, model, Types, Model } from "mongoose";
import type { AttemptSpecEnvelope } from "../model/quiz-shared";

export type AttemptState = "in_progress" | "finalized" | "invalidated";
export type AnswerPayload = Record<string, any>;

export interface AttemptDoc {
  _id: Types.ObjectId;
  quizId: Types.ObjectId | string;
  studentId: Types.ObjectId | string;
  classId: Types.ObjectId | string;
  scheduleId: Types.ObjectId | string;
  state: AttemptState;
  startedAt: Date;
  lastSavedAt?: Date;
  finishedAt?: Date;
  answers: Record<string, AnswerPayload>;
  score?: number;
  maxScore?: number;
  breakdown?: Array<{
    itemId: string;
    awarded: number;
    max: number;
    meta?: any;
  }>;
  quizVersionSnapshot: AttemptSpecEnvelope;
  attemptVersion: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Attempt schema
 * - Requires classId & scheduleId — all attempts are class-bound post-migration.
 * - Includes per-item breakdown for analytics and scheduled aggregation.
 */
const AttemptSchema = new Schema<AttemptDoc>(
  {
    quizId: { type: Schema.Types.ObjectId, required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, required: true, index: true },
    classId: { type: Schema.Types.ObjectId, required: true, index: true },
    scheduleId: { type: Schema.Types.ObjectId, required: true, index: true },

    state: {
      type: String,
      enum: ["in_progress", "finalized", "invalidated"],
      default: "in_progress",
      index: true,
    },

    startedAt: { type: Date, default: () => new Date(), index: true },
    lastSavedAt: { type: Date },
    finishedAt: { type: Date, index: true },

    answers: { type: Schema.Types.Mixed, default: {} },

    score: { type: Number },
    maxScore: { type: Number },
    breakdown: [
      {
        itemId: { type: String, required: true },
        awarded: { type: Number, required: true },
        max: { type: Number, required: true },
        meta: { type: Schema.Types.Mixed },
      },
    ],

    quizVersionSnapshot: { type: Schema.Types.Mixed, required: true },

    attemptVersion: { type: Number, default: 1 },
  },
  { timestamps: true }
);

/** Secondary indexes to optimize common queries */
AttemptSchema.index({ quizId: 1, state: 1, finishedAt: -1 });
AttemptSchema.index({ studentId: 1, startedAt: -1 });
AttemptSchema.index({ classId: 1, finishedAt: -1 });
AttemptSchema.index({ classId: 1, scheduleId: 1, studentId: 1 });

export const AttemptModel: Model<AttemptDoc> = model<AttemptDoc>(
  "QuizAttempt",
  AttemptSchema
);
