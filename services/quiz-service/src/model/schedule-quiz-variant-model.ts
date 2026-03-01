import { Schema, model, models, Types } from "mongoose";
import { QUIZ_TYPES, QuizTypeKey } from "./quiz-shared";

export type ScheduleQuizVariantDoc = {
  _id: Types.ObjectId;
  scheduleId: Types.ObjectId;
  quizRootId: Types.ObjectId;
  quizVersion: number;
  quizType: QuizTypeKey;
  variantData: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
};

const ScheduleQuizVariantSchema = new Schema<ScheduleQuizVariantDoc>(
  {
    scheduleId: { type: Schema.Types.ObjectId, required: true, index: true },
    quizRootId: { type: Schema.Types.ObjectId, required: true, index: true },
    quizVersion: { type: Number, required: true, index: true },
    quizType: {
      type: String,
      required: true,
      enum: QUIZ_TYPES,
      index: true,
    },
    variantData: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

ScheduleQuizVariantSchema.index(
  { scheduleId: 1, quizRootId: 1, quizVersion: 1 },
  { unique: true }
);

export const ScheduleQuizVariantModel =
  models.ScheduleQuizVariant ||
  model<ScheduleQuizVariantDoc>(
    "ScheduleQuizVariant",
    ScheduleQuizVariantSchema
  );
