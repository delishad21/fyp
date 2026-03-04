import { Document, model, models, Schema, Types } from "mongoose";

export interface GameAttemptDoc extends Document {
  attemptId: string;
  attemptVersion: number;
  quizId: string;
  quizRootId: string;
  quizVersion: number;
  scheduleId: string;
  classId: string;
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

export interface GameAttemptLean {
  _id: Types.ObjectId;
  attemptId: string;
  attemptVersion: number;
  quizId: string;
  quizRootId: string;
  quizVersion: number;
  scheduleId: string;
  classId: string;
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

const GameAttemptSchema = new Schema<GameAttemptDoc>(
  {
    attemptId: { type: String, required: true, unique: true, index: true },
    attemptVersion: { type: Number, required: true },
    quizId: { type: String, required: true, index: true },
    quizRootId: { type: String, required: true, index: true },
    quizVersion: { type: Number, required: true },
    scheduleId: { type: String, required: true, index: true },
    classId: { type: String, required: true, index: true },
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

GameAttemptSchema.index({ classId: 1, scheduleId: 1, studentId: 1, valid: 1 });
GameAttemptSchema.index({
  classId: 1,
  studentId: 1,
  scheduleId: 1,
  valid: 1,
  finishedAt: -1,
});
GameAttemptSchema.index({
  quizRootId: 1,
  quizVersion: 1,
  classId: 1,
  valid: 1,
});

export const GameAttemptModel =
  models.GameAttempt || model<GameAttemptDoc>("GameAttempt", GameAttemptSchema);
