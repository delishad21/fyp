import { Schema, model, models, Document, Types } from "mongoose";

/** Mirror of quiz attempts for audit/rebuild and version gating */
export interface ClassAttemptDoc extends Document {
  attemptId: string;
  attemptVersion: number;
  quizId: string;
  scheduleId: string | null;
  classId: string | null;
  studentId: string;
  subject?: string;
  topic?: string;
  finishedAt?: Date;
  score?: number;
  maxScore?: number;
  valid: boolean; // contributes to aggregates
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassAttemptLean {
  _id: Types.ObjectId;
  attemptId: string;
  attemptVersion: number;
  quizId: string;
  scheduleId: string | null;
  classId: string | null;
  studentId: string;
  subject?: string;
  topic?: string;
  finishedAt?: Date;
  score?: number;
  maxScore?: number;
  valid: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ClassAttemptSchema = new Schema<ClassAttemptDoc>(
  {
    attemptId: { type: String, required: true, unique: true, index: true },
    attemptVersion: { type: Number, required: true },
    quizId: { type: String, required: true, index: true },
    scheduleId: { type: String, default: null, index: true },
    classId: { type: String, default: null, index: true },
    studentId: { type: String, required: true, index: true },
    subject: { type: String },
    topic: { type: String },
    finishedAt: { type: Date },
    score: { type: Number },
    maxScore: { type: Number },
    valid: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Fast lookups for rebuilds/leaderboards
ClassAttemptSchema.index({ classId: 1, scheduleId: 1, studentId: 1, valid: 1 });
ClassAttemptSchema.index({
  classId: 1,
  studentId: 1,
  scheduleId: 1,
  valid: 1,
  finishedAt: -1,
});

export const ClassAttemptModel =
  models.ClassAttempt ||
  model<ClassAttemptDoc>("ClassAttempt", ClassAttemptSchema);
