import { Schema, model, Document, Types } from "mongoose";
import { ImageMetaSchema } from "../image/image-model";
import { IStudent, StudentSchema } from "../students/student-model";

export interface IAssignedQuiz {
  _id?: Types.ObjectId | string;
  quizId: string;
  startDate: Date;
  endDate: Date;

  /** Weight of this schedule toward overallScore (0..∞). Defaults to 100. */
  contribution?: number;

  // Optional snapshots for reporting/UX (non-authoritative)
  quizName?: string;
  subject?: string;
  subjectColor?: string;

  [key: string]: any;
}

export interface IClass {
  _id: Types.ObjectId;
  name: string;
  level: string;
  image?: typeof ImageMetaSchema;
  owner: string;
  teachers: string[];
  students: Types.DocumentArray<IStudent>;
  schedule: IAssignedQuiz[];
  metadata?: Record<string, any>;
  /**
   * IANA timezone (e.g., "Asia/Singapore").
   * Used for streak/day-boundary calculations and date rendering.
   */
  timezone?: string;
}

const AssignedQuizSchema = new Schema<IAssignedQuiz>(
  {
    quizId: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    contribution: { type: Number, default: 100, min: 0 },

    // UX snapshots (best effort)
    quizName: { type: String },
    subject: { type: String },
    subjectColor: { type: String },
  },
  { _id: true }
);

const ClassSchema = new Schema<IClass>(
  {
    name: { type: String, required: true },
    level: { type: String, required: true },
    image: { type: ImageMetaSchema, default: null },

    owner: { type: String, required: true },
    teachers: [{ type: String, required: true }],

    students: { type: [StudentSchema], default: [] },

    schedule: { type: [AssignedQuizSchema], default: [] },

    metadata: { type: Map, of: Schema.Types.Mixed },

    timezone: { type: String, default: "Asia/Singapore" },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for common queries
ClassSchema.index({ "students.userId": 1 });
ClassSchema.index({ "schedule._id": 1 });
ClassSchema.index({ "schedule.quizId": 1 });
ClassSchema.index({ "schedule.startDate": 1, "schedule.endDate": 1 });

export const ClassModel = model<IClass>("Class", ClassSchema);
