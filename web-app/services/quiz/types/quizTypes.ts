import { ImageMeta } from "@/services/images/types";

export type QuizType =
  | "basic"
  | "rapid"
  | "crossword"
  | "rapid-arithmetic"
  | "crossword-bank"
  | "true-false"
  | "ai-generated";

export type QuizTypeDef = {
  title: string;
  id: QuizType;
  description: string[];
  imagePath?: string;
  color: string;
  href: string;
};

/** Shared base fields */
export type CreateQuizBase = {
  name: string;
  subject: string;
  topic: string;
  quizType: QuizType;
};

/** MC option (used by basic & rapid) */
export type MCOption = {
  id: string;
  text: string;
  correct: boolean;
};

/** Open-ended accepted answer (basic) */
export type OpenAnswer = {
  id: string;
  text: string;
  caseSensitive: boolean;

  // Answer validation type
  answerType?: "exact" | "fuzzy" | "keywords" | "list";

  // For keyword mode
  keywords?: string[];
  minKeywords?: number;

  // For list mode
  listItems?: string[];
  requireOrder?: boolean;
  minCorrectItems?: number;

  // For fuzzy mode
  similarityThreshold?: number; // 0.5 to 1.0
};

/** ---------------- Shared Form Items---------------- */

export type MCItem = {
  id: string;
  type: "mc";
  text: string;
  timeLimit: number | null; // seconds
  image?: ImageMeta | null; // use ImageMeta instead of File/imageName
  options: MCOption[]; // >= 1 correct allowed
};

export type OpenItem = {
  id: string;
  type: "open";
  text: string;
  timeLimit: number | null; // seconds
  image?: ImageMeta | null;
  answers: OpenAnswer[];
};

export type ContextItem = {
  id: string;
  type: "context";
  text: string;
  image?: ImageMeta | null;
};

export type BaseFormItem = MCItem | OpenItem | ContextItem;

export type BaseFormItemDraft = {
  id: string;
  type: "mc" | "open" | "context";
  text: string;
  image?: ImageMeta | null;
  imageName?: string;
  timeLimit: number | null;
  options?: MCOption[];
  answers?: OpenAnswer[];
};

/** ---------------- BASIC ---------------- */

export type BasicItem = MCItem | OpenItem | ContextItem;

export type BasicTopFields = "name" | "subject" | "topic";

/** ---------------- RAPID ---------------- */

export type RapidItem = MCItem;

export type RapidTopFields = "name" | "subject" | "topic";

/** ---------------- TRUE/FALSE ---------------- */
export type TrueFalseItem = MCItem;
export type TrueFalseTopFields = "name" | "subject" | "topic";

/** ---------------- RAPID ARITHMETIC --------- */
export type RapidArithmeticAddSubSettings = {
  operandMin: number;
  operandMax: number;
  answerMin: number;
  answerMax: number;
  allowNegative: boolean;
};

export type RapidArithmeticMultiplicationSettings = {
  mode: "times-table" | "range";
  tables: number[];
  multiplierMin: number;
  multiplierMax: number;
  operandMin: number;
  operandMax: number;
  answerMin: number;
  answerMax: number;
};

export type RapidArithmeticDivisionSettings = {
  divisorMin: number;
  divisorMax: number;
  quotientMin: number;
  quotientMax: number;
  answerMin: number;
  answerMax: number;
  allowNegative: boolean;
};

export type RapidArithmeticOperationSettings = {
  addition: RapidArithmeticAddSubSettings;
  subtraction: RapidArithmeticAddSubSettings;
  multiplication: RapidArithmeticMultiplicationSettings;
  division: RapidArithmeticDivisionSettings;
};

export type RapidArithmeticConfig = {
  questionCount: number;
  operators: Array<"+" | "-" | "*" | "/">;
  timePerQuestion: number;
  choicesPerQuestion: number;
  operationSettings: RapidArithmeticOperationSettings;
};

export type RapidArithmeticTopFields =
  | "name"
  | "subject"
  | "topic"
  | "questionCount"
  | "operators"
  | "timePerQuestion"
  | "choicesPerQuestion"
  | "operationSettings";

/** ---------------- CROSSWORD ------------- */
export type CrosswordEntry = {
  id: string;
  answer: string;
  clue: string;
};

export type CrosswordTopFields =
  | "name"
  | "subject"
  | "topic"
  | "totalTimeLimit"
  | "entries";

/** ---------------- CROSSWORD BANK ------------ */
export type CrosswordBankEntry = {
  id: string;
  answer: string;
  clue: string;
};

export type CrosswordBankTopFields =
  | "name"
  | "subject"
  | "topic"
  | "totalTimeLimit"
  | "wordsPerQuiz"
  | "entriesBank";

export type Cell = { letter: string | null; isBlocked: boolean };

export type CrosswordPlacedEntry = {
  id: string;
  answer: string;
  clue: string;
  direction: Direction | null;
  positions: { row: number; col: number }[];
};

export type CrosswordApiEntry = {
  id: string;
  answer: string;
  clue: string;
  direction: string | null; // raw from API
  positions: { row: number; col: number }[];
};

export type Direction = "across" | "down" | null;

/** ---------------- Payloads -------------- */
export type BasicQuizPayload = CreateQuizBase & {
  quizType: "basic";
  items: BasicItem[]; // no File augmentation needed
};

export type RapidQuizPayload = CreateQuizBase & {
  quizType: "rapid";
  items: RapidItem[]; // no File augmentation needed
};

export type TrueFalseQuizPayload = CreateQuizBase & {
  quizType: "true-false";
  items: TrueFalseItem[];
};

export type RapidArithmeticQuizPayload = CreateQuizBase & {
  quizType: "rapid-arithmetic";
  questionCount: number;
  operators: Array<"+" | "-" | "*" | "/">;
  timePerQuestion: number;
  choicesPerQuestion: number;
  operationSettings: RapidArithmeticOperationSettings;
};

export type CrosswordQuizPayload = CreateQuizBase & {
  quizType: "crossword";
  totalTimeLimit: number | null; // allow unlimited in types too
  entries: CrosswordEntry[];
};

export type CrosswordBankQuizPayload = CreateQuizBase & {
  quizType: "crossword-bank";
  totalTimeLimit: number | null;
  wordsPerQuiz: number;
  entriesBank: CrosswordBankEntry[];
};

export type CreateQuizPayload =
  | BasicQuizPayload
  | RapidQuizPayload
  | CrosswordQuizPayload
  | TrueFalseQuizPayload
  | RapidArithmeticQuizPayload
  | CrosswordBankQuizPayload;

/** Server action UI state */
export type CreateQuizState = {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors: {
    name?: string | string[];
    subject?: string | string[];
    topic?: string | string[];
    quizType?: string | string[];
    totalTimeLimit?: string | string[]; // used by crossword
    entries?: string | string[]; // used by crossword
    wordsPerQuiz?: string | string[];
    entriesBank?: string | string[];
    questionCount?: string | string[];
    operators?: string | string[];
    timePerQuestion?: string | string[];
    choicesPerQuestion?: string | string[];
    operationSettings?: string | string[];
  };
  /** Aligned 1:1 with items/entries in questionsJson for highlighting */
  questionErrors: Array<string | string[] | undefined>;
  values: {
    name: string;
    subject: string;
    topic: string;
    quizType: QuizType;
    totalTimeLimit?: number | null; // for crossword; optional in state for re-hydrate
  };
  redirect?: string;
};

// Quiz Form Hooks

export type BaseQuizFormItemsConfig = {
  maxQuestions?: number; // e.g. 20
  mcMinOptions?: number; // e.g. 2
  mcMaxOptions?: number; // e.g. 4/6
  mcRequireSingleCorrect?: boolean; // true if you want exactly 1 correct
  initialNumMCOptions?: number;
};

/** ------- Types returned to forms (match components' initialData) ------- */

export type RapidInitial = {
  id: string; // rootQuizId
  version: number; // current version number
  name: string;
  subject: string;
  subjectColorHex: string;
  topic: string;
  quizType: "rapid";
  typeColorHex: string;
  items: BaseFormItemDraft[];
};

export type TrueFalseInitial = {
  id: string;
  version: number;
  name: string;
  subject: string;
  subjectColorHex: string;
  topic: string;
  quizType: "true-false";
  typeColorHex: string;
  items: BaseFormItemDraft[];
};

export type CrosswordInitial = {
  id: string; // rootQuizId
  version: number;
  name: string;
  subject: string;
  subjectColorHex: string;
  topic: string;
  quizType: "crossword";
  typeColorHex: string;
  totalTimeLimit: number | null;
  entries: { id: string; answer: string; clue: string }[];
  placedEntries?: CrosswordPlacedEntry[];
  grid?: Cell[][];
};

export type BasicInitial = {
  id: string; // rootQuizId
  version: number;
  name: string;
  subject: string;
  subjectColorHex: string;
  topic: string;
  quizType: "basic";
  typeColorHex: string;
  totalTimeLimit?: number | null;
  items: BaseFormItemDraft[];
};

export type RapidArithmeticInitial = {
  id: string;
  version: number;
  name: string;
  subject: string;
  subjectColorHex: string;
  topic: string;
  quizType: "rapid-arithmetic";
  typeColorHex: string;
  questionCount: number;
  operators: Array<"+" | "-" | "*" | "/">;
  timePerQuestion: number;
  choicesPerQuestion: number;
  operationSettings: RapidArithmeticOperationSettings;
};

export type CrosswordBankInitial = {
  id: string;
  version: number;
  name: string;
  subject: string;
  subjectColorHex: string;
  topic: string;
  quizType: "crossword-bank";
  typeColorHex: string;
  totalTimeLimit: number | null;
  wordsPerQuiz: number;
  entriesBank: CrosswordBankEntry[];
};
