export type QuizType = "basic" | "rapid" | "crossword" | "true-false";
export type DocumentType =
  | "syllabus"
  | "question-bank"
  | "subject-content"
  | "other";
export type TimerType = "default" | "custom" | "none";

export type AIModel = {
  id: string;
  provider: "openai" | "anthropic" | "gemini";
  model: string;
  label: string;
  description: string;
};

export type AttemptAnalytics = {
  attemptNumber: number;
  success: boolean;
  provider?: string;
  model?: string;
  llmLatencyMs: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export type QuizAnalytics = {
  attempts?: AttemptAnalytics[];
  totals?: {
    attemptCount?: number;
    successfulAttempts?: number;
    llmLatencyMs?: number;
  };
};

export type DraftQuiz = {
  tempId: string;
  quizType: QuizType;
  name: string;
  subject: string;
  topic: string;
  status:
    | "pending"
    | "generating"
    | "draft"
    | "approved"
    | "rejected"
    | "failed";
  retryCount?: number;
  items?: Array<any>;
  entries?: Array<any>;
  grid?: Array<Array<any>>;
  placedEntries?: Array<any>;
  analytics?: QuizAnalytics;
};

export type ProviderModelAnalytics = {
  provider: string;
  model: string;
  attemptCount: number;
  successfulAttempts: number;
  llmLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type PlanningAnalytics = {
  success?: boolean;
  fallbackUsed?: boolean;
  attemptCount?: number;
  successfulAttempts?: number;
  retryCount?: number;
  provider?: string;
  model?: string;
  llmLatencyMs?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  startedAt?: string;
  completedAt?: string;
  planItemCount?: number;
  error?: string;
};

export type GenerationJob = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  error?: string;
  progress: {
    current: number;
    total: number;
    quizzes?: Array<{
      tempId: string;
      quizNumber: number;
      status: "pending" | "generating" | "completed" | "failed";
      retryCount: number;
      error?: string;
      analytics?: QuizAnalytics;
    }>;
  };
  results?: {
    total: number;
    successful: number;
    failed: number;
    quizzes: DraftQuiz[];
  };
  analytics?: {
    planning?: PlanningAnalytics;
    totals?: {
      attemptCount?: number;
      successfulAttempts?: number;
      retryCount?: number;
      llmLatencyMs?: number;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
    byProviderModel?: ProviderModelAnalytics[];
  };
};

export type Metrics = {
  completionRate: number;
  planningLatencyMs: number | null;
  generationLatencyMs: number | null;
  totalLlmLatencyMs: number | null;
  planningFallbackUsed: boolean | null;
  planningSuccess: boolean | null;
  planningPlanItemCount: number | null;
  planningInputTokens: number | null;
  planningOutputTokens: number | null;
  planningTotalTokens: number | null;
  overallTotalTokens: number | null;
  generationAttemptCount: number | null;
  generationSuccessfulAttempts: number | null;
  generationInputTokens: number | null;
  generationOutputTokens: number | null;
  generationTotalTokens: number | null;
  planningEstimatedCostUsd: number | null;
  generationEstimatedCostUsd: number | null;
  overallEstimatedCostUsd: number | null;
  hasUnpricedCalls: boolean;
  retryCount: number;
  wallClockMs: number | null;
};

export type UploadedReferenceDocument = {
  id: string;
  file: File;
  documentType: DocumentType;
  sourcePath?: string;
};

export type TestcaseDocumentRef = {
  path: string;
  documentType: DocumentType;
};

export type ImportedTestcase = {
  id: string;
  title: string;
  subject: string;
  educationLevel:
    | "primary-1"
    | "primary-2"
    | "primary-3"
    | "primary-4"
    | "primary-5"
    | "primary-6";
  instructions: string;
  quizTypes: QuizType[];
  numQuizzes?: number;
  questionsPerQuiz?: number;
  timerType?: TimerType;
  customTimerSeconds?: number;
  documents?: TestcaseDocumentRef[];
};

export type TestcaseRunStatus = "idle" | "running" | "completed" | "failed";

export type TestcaseRecord = ImportedTestcase & {
  status: TestcaseRunStatus;
  lastJobId?: string;
  lastError?: string;
  lastRunCompletedAt?: string;
  lastModelId?: string;
  lastModelLabel?: string;
};

export type TestcaseRunRecord = {
  testcaseId: string;
  testcaseTitle: string;
  testcaseInstructions: string;
  subject: string;
  educationLevel: string;
  modelId: string;
  modelLabel: string;
  modelProvider: string;
  modelName: string;
  runStartedAt: string;
  runCompletedAt: string;
  jobId: string;
  jobStatus: string;
  metrics: Metrics;
  planningProvider: string;
  planningModel: string;
  planningError: string;
  quizPdfFileName: string;
  quizPdfPathRef: string;
  job: GenerationJob;
};
