import { Schema, model, Document, Types } from "mongoose";
import { ImageMetaSchema } from "../image/image-model";
import { IStudent, StudentSchema } from "../students/student-model";

export interface IAssignedQuiz {
  _id?: Types.ObjectId | string;

  // Concrete quiz document id from quiz-svc (still stored, but not used for identity)
  quizId: string;

  // Canonical quiz identity (used for identification)
  quizRootId: string;
  quizVersion: number;

  startDate: Date;
  endDate: Date;

  /** Weight of this schedule toward overallScore (0..∞). Defaults to 100. */
  contribution?: number;

  /** Max attempts a student may make for this schedule. Defaults 1, min 1, max 10. */
  attemptsAllowed?: number;

  /** Whether students can view answers/breakdown after attempting. Defaults false. */
  showAnswersAfterAttempt?: boolean;

  // Optional snapshots for reporting/UX (non-authoritative)
  quizName?: string;
  subject?: string;
  subjectColor?: string;
  topic?: string;
  quizType?: string;

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
    // Concrete quiz document id from quiz-svc
    quizId: { type: String, required: true },

    // Canonical quiz identity
    quizRootId: { type: String, required: true },
    quizVersion: { type: Number, required: true },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    contribution: { type: Number, default: 100, min: 0 },

    attemptsAllowed: {
      type: Number,
      default: 1,
      min: 1,
      max: 10,
    },
    showAnswersAfterAttempt: {
      type: Boolean,
      default: false,
    },

    // UX snapshots (best effort)
    quizName: { type: String },
    subject: { type: String },
    subjectColor: { type: String },
    topic: { type: String },
    quizType: { type: String },
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
// Indexes for common queries
ClassSchema.index({ "students.userId": 1 });
ClassSchema.index({ "schedule._id": 1 });
ClassSchema.index({ "schedule.quizId": 1 }); // useful for stats/metadata lookups
ClassSchema.index({ "schedule.quizRootId": 1, "schedule.quizVersion": 1 });
ClassSchema.index({ "schedule.startDate": 1, "schedule.endDate": 1 });

export const ClassModel = model<IClass>("Class", ClassSchema);
