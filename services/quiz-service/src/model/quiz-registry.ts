import type { Model } from "mongoose";
import "dotenv/config";
import { connect } from "mongoose";
import { registerBasicQuiz } from "./quiz-types/quiz-basic";
import { registerCrosswordBankQuiz } from "./quiz-types/quiz-crossword-bank";
import { registerCrosswordQuiz } from "./quiz-types/quiz-crossword";
import { registerRapidArithmeticQuiz } from "./quiz-types/quiz-rapid-arithmetic";
import { registerRapidQuiz } from "./quiz-types/quiz-rapid";
import { registerTrueFalseQuiz } from "./quiz-types/quiz-true-false";
import {
  Answer,
  AttemptSpecEnvelope,
  AutoscoreResult,
  QuizTypeKey,
  ScheduleBreakdownInput,
  ScheduleBreakdownOutput,
} from "./quiz-shared";

/**
 * DB connection for quiz-service
 */
export async function connectToDB() {
  const mongoDBUri = process.env.QUIZ_MONGODB_URI;
  if (!mongoDBUri) throw new Error("MongoDB URI is not provided");
  await connect(mongoDBUri);
}

/**
 * Contract each quiz type must satisfy.
 * Add a new type by implementing these and calling registerQuizType().
 */
export type QuizTypeDef = {
  type: QuizTypeKey;
  Model: Model<any>;
  readItemsFromBody: (body: any) => any[];
  coerceItems: (raw: any[]) => any[];
  validate: (
    body: any,
    items: any[]
  ) => {
    fieldErrors: Record<string, string | string[] | undefined>;
    questionErrors: Array<string[] | undefined>;
  };
  buildTypePatch: (
    body: any,
    items: any[],
    fileMap?: Record<string, any>
  ) => Record<string, any>;

  buildAttemptSpec: (quizDoc: any) => AttemptSpecEnvelope;
  gradeAttempt: (
    spec: AttemptSpecEnvelope,
    answers: Answer[]
  ) => AutoscoreResult;

  /** Aggregation for scheduled attempts (used by class-service). */
  aggregateScheduledQuiz: (
    input: ScheduleBreakdownInput
  ) => ScheduleBreakdownOutput;

  /**
   * Optional schedule-anchored variant generator.
   * When provided, quiz-service persists one variant per
   * (scheduleId, quizRootId, quizVersion) and uses it for attempt spec creation.
   */
  buildScheduleVariant?: (
    quizDoc: any,
    ctx: { scheduleId: string }
  ) => Record<string, any>;
};

/** Type registry for dynamic lookups */
const REGISTRY = new Map<QuizTypeKey, QuizTypeDef>();

export function registerQuizType(def: QuizTypeDef) {
  REGISTRY.set(def.type, def);
}

export function getQuizTypeDef(type: QuizTypeKey): QuizTypeDef | undefined {
  return REGISTRY.get(type);
}

/** Register all built-in quiz types
 * NOTE: This must be called once at server startup.
 * For new quiz types, add a new registerXYZQuiz() call here.
 */
export async function registerAllQuizzes() {
  registerBasicQuiz();
  registerCrosswordBankQuiz();
  registerCrosswordQuiz();
  registerRapidArithmeticQuiz();
  registerRapidQuiz();
  registerTrueFalseQuiz();
}
