import { Document, Model, Schema, Types, model, models } from "mongoose";

export interface ITeacherGenerationQuotaUsage extends Document {
  _id: Types.ObjectId;
  teacherId: Types.ObjectId;
  generationsUsed: number;
  lastConsumedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const TeacherGenerationQuotaUsageSchema =
  new Schema<ITeacherGenerationQuotaUsage>(
    {
      teacherId: {
        type: Schema.Types.ObjectId,
        required: true,
        unique: true,
        index: true,
      },
      generationsUsed: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
      lastConsumedAt: {
        type: Date,
        default: null,
      },
    },
    { timestamps: true },
  );

const TeacherGenerationQuotaUsageModel: Model<ITeacherGenerationQuotaUsage> =
  (models.TeacherGenerationQuotaUsage as
    | Model<ITeacherGenerationQuotaUsage>
    | undefined) ||
  model<ITeacherGenerationQuotaUsage>(
    "TeacherGenerationQuotaUsage",
    TeacherGenerationQuotaUsageSchema,
  );

export default TeacherGenerationQuotaUsageModel;
