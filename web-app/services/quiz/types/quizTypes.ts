export type QuizType = "basic" | "rapid" | "crossword";

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

/** Image metadata sent from client (after separate upload) */
export type ImageMeta = {
  url: string; // required: where to fetch it from
  filename?: string;
  mimetype?: string;
  size?: number;
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
};

/** ---------------- Shared Form Items---------------- */

export type MCItem = {
  id: string;
  type: "mc";
  text: string;
  timeLimit: number | null; // seconds
  image?: ImageMeta | null; // ← use ImageMeta instead of File/imageName
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
  items: BasicItem[]; // ← no File augmentation needed
};

export type RapidQuizPayload = CreateQuizBase & {
  quizType: "rapid";
  items: RapidItem[]; // ← no File augmentation needed
};

export type CrosswordQuizPayload = CreateQuizBase & {
  quizType: "crossword";
  totalTimeLimit: number | null; // allow unlimited in types too
  entries: CrosswordEntry[];
};

export type CreateQuizPayload =
  | BasicQuizPayload
  | RapidQuizPayload
  | CrosswordQuizPayload;

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
  id: string;
  name: string;
  subject: string;
  topic: string;
  quizType: "rapid";
  items: BaseFormItemDraft[];
};

export type CrosswordInitial = {
  id: string;
  name: string;
  subject: string;
  topic: string;
  quizType: "crossword";
  totalTimeLimit: number | null;
  entries: { id: string; answer: string; clue: string }[];
  placedEntries?: CrosswordPlacedEntry[];
  grid?: Cell[][];
};

export type BasicInitial = {
  id: string;
  name: string;
  subject: string;
  topic: string;
  quizType: "basic";
  items: BaseFormItemDraft[];
};
