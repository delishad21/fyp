import { Schema, model, models, Types } from "mongoose";

export const QUIZ_TYPES = ["basic", "rapid", "crossword"] as const;
export type QuizTypeKey = (typeof QUIZ_TYPES)[number];

export type BaseQuizLean = {
  _id: Types.ObjectId;
  owner: Types.ObjectId;
  quizType: QuizTypeKey;
  name: string;
  subject: string;
  topic: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export const BaseQuizSchema = new Schema(
  {
    owner: { type: Types.ObjectId, ref: "User", required: true, index: true },
    quizType: {
      type: String,
      required: true,
      index: true,
      enum: QUIZ_TYPES,
    },
    name: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    topic: { type: String, required: true, trim: true },
  },
  {
    timestamps: true,
    discriminatorKey: "quizType",
    minimize: true,
  }
);

export const QuizBaseModel = models.Quiz || model("Quiz", BaseQuizSchema);
