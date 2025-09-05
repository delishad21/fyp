import type { Model } from "mongoose";
import "dotenv/config";
import { connect } from "mongoose";
import { registerBasicQuiz } from "./quiz-types/quiz-basic";
import { registerCrosswordQuiz } from "./quiz-types/quiz-crossword";
import { registerRapidQuiz } from "./quiz-types/quiz-rapid";


export async function connectToDB() {
  let mongoDBUri = process.env.QUIZ_MONGODB_URI;

  if (!mongoDBUri) {
    throw new Error("MongoDB URI is not provided");
  }

  await connect(mongoDBUri);
}

/** what each quiz type must provide */
export type QuizTypeDef = {
  /** the discriminator string, e.g. "basic" */
  type: string;
  /** the discriminator model to create/update docs of this type */
  Model: Model<any>;
  /** parse the items array (e.g., itemsJson / entriesJson) from req.body */
  readItemsFromBody: (body: any) => any[];
  /** coerce raw -> strictly shaped items/entries */
  coerceItems: (raw: any[]) => any[];
  /**
   * validate base fields + items/entries. return per-field+per-item errors
   * See signature: `validate(body, items) -> { fieldErrors, questionErrors }`
   * fieldErrors is a sparse object (e.g., { name?: string, totalTimeLimit?: string }).
   * questionErrors is an array aligned to items length (string[] | undefined).
   */
  validate: (
    body: any,
    items: any[]
  ) => {
    fieldErrors: Record<string, string | string[] | undefined>;
    questionErrors: Array<string[] | undefined>;
  };
  /**
   * build the patch used for create/update from (body, items, fileMap).
   * should return only type-specific fields (e.g., { items } or { entries, totalTimeLimit }).
   */
  buildTypePatch: (
    body: any,
    items: any[],
    fileMap?: Record<string, any>
  ) => Record<string, any>;
};

/** registry for dynamic lookup */
const REGISTRY = new Map<string, QuizTypeDef>();

export function registerQuizType(def: QuizTypeDef) {
  REGISTRY.set(def.type, def);
}

export function getQuizTypeDef(type: string): QuizTypeDef | undefined {
  return REGISTRY.get(type);
}

export function registerAllQuizzes() {
    // Add all quizzes to registry
    registerBasicQuiz();
    registerCrosswordQuiz();
    registerRapidQuiz();
}