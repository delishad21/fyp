import mongoose, { Schema, Document, Types } from "mongoose";

export interface IDraftQuiz {
  tempId: string;
  quizType: "basic" | "rapid" | "crossword" | "true-false";
  name: string;
  subject: string;
  topic: string;
  items: any[]; // Will match the quiz type structure
  entries?: any[]; // For crossword quizzes
  grid?: any[][]; // For crossword quizzes
  placedEntries?: any[]; // For crossword quizzes
  totalTimeLimit?: number | null;
  status:
    | "pending"
    | "generating"
    | "draft"
    | "approved"
    | "rejected"
    | "failed";
  savedQuizId?: Types.ObjectId;
  error?: string;
  retryCount?: number;
  analytics?: IQuizAnalytics;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILLMTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface IQuizAttemptAnalytics {
  attemptNumber: number;
  success: boolean;
  provider: "openai" | "anthropic" | "gemini";
  model: string;
  llmLatencyMs: number;
  usage: ILLMTokenUsage;
  startedAt: Date;
  completedAt: Date;
  error?: string;
}

export interface IQuizAnalyticsTotals {
  attemptCount: number;
  successfulAttempts: number;
  retryCount: number;
  llmLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface IQuizAnalytics {
  attempts: IQuizAttemptAnalytics[];
  totals: IQuizAnalyticsTotals;
}

export interface IJobProviderModelAnalytics {
  provider: "openai" | "anthropic" | "gemini";
  model: string;
  attemptCount: number;
  successfulAttempts: number;
  llmLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface IPlanningPassAnalytics {
  success: boolean;
  fallbackUsed: boolean;
  attemptCount: number;
  successfulAttempts: number;
  retryCount: number;
  provider?: "openai" | "anthropic" | "gemini";
  model?: string;
  llmLatencyMs?: number;
  usage?: ILLMTokenUsage;
  startedAt: Date;
  completedAt: Date;
  planItemCount: number;
  error?: string;
}

export interface IJobAnalytics {
  totals: IQuizAnalyticsTotals;
  byProviderModel: IJobProviderModelAnalytics[];
  generatedAt: Date;
  planning?: IPlanningPassAnalytics;
}

export interface IGenerationConfig {
  instructions: string; // Required - main generation prompt
  numQuizzes: number;
  quizTypes: Array<"basic" | "rapid" | "crossword" | "true-false">;
  educationLevel:
    | "primary-1"
    | "primary-2"
    | "primary-3"
    | "primary-4"
    | "primary-5"
    | "primary-6";
  questionsPerQuiz: number;
  aiModel?: string; // Optional model id selected in UI
  subject: string;
  timerSettings?: {
    type: "default" | "custom" | "none";
    defaultSeconds?: number;
  };
}

export interface IDocumentMeta {
  documentType?: "syllabus" | "question-bank" | "subject-content" | "other";
  filename: string;
  originalName: string;
  size: number;
  mimetype: string;
  storagePath: string;
  uploadedAt: Date;
}

export interface IGenerationResults {
  total: number;
  successful: number;
  failed: number;
  quizzes: IDraftQuiz[];
}

export interface IGenerationJob extends Document {
  _id: Types.ObjectId;
  teacherId: Types.ObjectId;
  status: "pending" | "processing" | "completed" | "failed";
  config: IGenerationConfig;
  documentMeta?: IDocumentMeta[]; // Now optional array for multiple files
  extractedText?: string;
  results?: IGenerationResults;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress: {
    current: number;
    total: number;
    quizzes?: Array<{
      tempId: string;
      quizNumber: number;
      status: "pending" | "generating" | "completed" | "failed";
      error?: string;
      retryCount: number;
      analytics?: IQuizAnalytics;
    }>;
  };
  analytics?: IJobAnalytics;
}

const DraftQuizSchema = new Schema<IDraftQuiz>(
  {
    tempId: { type: String, required: true },
    quizType: {
      type: String,
      required: true,
      enum: ["basic", "rapid", "crossword", "true-false"],
    },
    name: { type: String, required: true },
    subject: { type: String, required: true },
    topic: { type: String, required: true },
    items: { type: Schema.Types.Mixed, default: [] }, // Not required for crosswords
    entries: { type: Schema.Types.Mixed }, // For crossword
    grid: { type: Schema.Types.Mixed }, // For crossword
    placedEntries: { type: Schema.Types.Mixed }, // For crossword
    totalTimeLimit: { type: Number, default: null },
    status: {
      type: String,
      required: true,
      enum: [
        "pending",
        "generating",
        "draft",
        "approved",
        "rejected",
        "failed",
      ],
      default: "pending",
    },
    savedQuizId: { type: Schema.Types.ObjectId, ref: "Quiz" },
    error: { type: String },
    retryCount: { type: Number, default: 0 },
    analytics: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

const GenerationConfigSchema = new Schema<IGenerationConfig>(
  {
    instructions: { type: String, required: true }, // Required field
    numQuizzes: { type: Number, required: true, min: 1, max: 20 },
    quizTypes: {
      type: [
        {
          type: String,
          enum: ["basic", "rapid", "crossword", "true-false"],
        },
      ],
      required: true,
      validate: {
        validator: (arr: string[]) => Array.isArray(arr) && arr.length > 0,
        message: "At least one quiz type is required",
      },
    },
    educationLevel: {
      type: String,
      required: true,
      enum: [
        "primary-1",
        "primary-2",
        "primary-3",
        "primary-4",
        "primary-5",
        "primary-6",
      ],
    },
    questionsPerQuiz: { type: Number, required: true, min: 5, max: 20 },
    aiModel: { type: String },
    subject: { type: String, required: true },
    timerSettings: {
      type: new Schema(
        {
          type: { type: String, enum: ["default", "custom", "none"] },
          defaultSeconds: { type: Number },
        },
        { _id: false },
      ),
    },
  },
  { _id: false },
);

const DocumentMetaSchema = new Schema<IDocumentMeta>(
  {
    documentType: {
      type: String,
      enum: ["syllabus", "question-bank", "subject-content", "other"],
      default: "other",
    },
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    size: { type: Number, required: true },
    mimetype: { type: String, required: true },
    storagePath: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const GenerationResultsSchema = new Schema<IGenerationResults>(
  {
    total: { type: Number, required: true },
    successful: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    quizzes: [DraftQuizSchema],
  },
  { _id: false },
);

const GenerationJobSchema = new Schema<IGenerationJob>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    config: {
      type: GenerationConfigSchema,
      required: true,
    },
    documentMeta: {
      type: [DocumentMetaSchema],
      required: false, // Now optional
    },
    extractedText: { type: String },
    results: { type: GenerationResultsSchema },
    error: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
    progress: {
      current: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      quizzes: [
        {
          tempId: { type: String },
          quizNumber: { type: Number },
          status: {
            type: String,
            enum: ["pending", "generating", "completed", "failed"],
          },
          error: { type: String },
          retryCount: { type: Number, default: 0 },
          analytics: { type: Schema.Types.Mixed },
        },
      ],
    },
    analytics: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    collection: "generation_jobs",
  },
);

// Indexes for common queries
GenerationJobSchema.index({ teacherId: 1, createdAt: -1 });
GenerationJobSchema.index({ status: 1, createdAt: -1 });
GenerationJobSchema.index({ teacherId: 1, status: 1 });

export const GenerationJobModel = mongoose.model<IGenerationJob>(
  "GenerationJob",
  GenerationJobSchema,
);
