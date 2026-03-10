import { model, models, Schema } from "mongoose";

export interface IGameAttemptOutcome {
  classId: string;
  studentId: string;
  scheduleId: string;
  attemptId: string;
  attemptVersion: number;
  quizScore: number;
  quizMaxScore: number;
  overallScoreBefore: number;
  overallScoreAfter: number;
  rankBefore: number | null;
  rankAfter: number | null;
  processedAt: Date;
  updatedAt: Date;
}

const GameAttemptOutcomeSchema = new Schema<IGameAttemptOutcome>(
  {
    classId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    scheduleId: { type: String, required: true, index: true },
    attemptId: { type: String, required: true, unique: true, index: true },
    attemptVersion: { type: Number, required: true, default: 1 },
    quizScore: { type: Number, required: true, default: 0 },
    quizMaxScore: { type: Number, required: true, default: 0 },
    overallScoreBefore: { type: Number, required: true, default: 0 },
    overallScoreAfter: { type: Number, required: true, default: 0 },
    rankBefore: { type: Number, required: false, default: null },
    rankAfter: { type: Number, required: false, default: null },
    processedAt: { type: Date, required: true, default: () => new Date() },
    updatedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: false }
);

GameAttemptOutcomeSchema.index({ classId: 1, studentId: 1, processedAt: -1 });
GameAttemptOutcomeSchema.index({ classId: 1, studentId: 1, attemptId: 1 });

export const GameAttemptOutcomeModel =
  models.GameAttemptOutcome ||
  model<IGameAttemptOutcome>("GameAttemptOutcome", GameAttemptOutcomeSchema);
