import { Schema, Types } from "mongoose";

/** ---------- Quiz type keys & labels/colors ---------- */
export const QUIZ_TYPES = ["basic", "rapid", "crossword"] as const;
export type QuizTypeKey = (typeof QUIZ_TYPES)[number];
export function isQuizType(x: unknown): x is QuizTypeKey {
  return (
    typeof x === "string" &&
    (QUIZ_TYPES as readonly string[]).includes(x as any)
  );
}

export const QUIZ_TYPE_COLORS: Record<QuizTypeKey, string> = {
  basic: "#22c55e",
  rapid: "#f59e0b",
  crossword: "#3b82f6",
};
export const QUIZ_TYPE_LABELS: Record<QuizTypeKey, string> = {
  basic: "Basic",
  rapid: "Rapid",
  crossword: "Crossword",
};

/** ---------- Shared sub-schemas for images/options/answers ---------- */
export const ImageMetaSchema = new Schema(
  {
    filename: String,
    path: String,
    mimetype: String,
    size: Number,
    url: String,
    key: String,
  },
  { _id: false }
);

export const MCOptionSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, default: "" },
    correct: { type: Boolean, default: false },
  },
  { _id: false }
);

export const OpenAnswerSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, default: "" },
    caseSensitive: { type: Boolean, default: false },
  },
  { _id: false }
);

/** ---------- Attempt spec (render & grading) ---------- */
export type RenderItem =
  | {
      kind: "mc";
      id: string;
      text: string;
      options: { id: string; text: string }[];
      image?: any;
      timeLimit?: number | null;
    }
  | {
      kind: "open";
      id: string;
      text: string;
      image?: any;
      timeLimit?: number | null;
    }
  | { kind: "context"; id: string; text: string; image?: any }
  | {
      kind: "crossword";
      id: "crossword";
      totalTimeLimit: number | null;
      grid?: any;
      entries: {
        id: string;
        clue: string;
        length?: number;
        positions?: { row: number; col: number }[];
        direction?: "across" | "down" | null;
      }[];
    };

export type GradingKeyItem =
  | { kind: "mc"; id: string; correctOptionIds: string[]; maxScore?: number }
  | {
      kind: "open";
      id: string;
      accepted: { text: string; caseSensitive?: boolean }[];
      maxScore?: number;
    }
  | { kind: "crossword"; id: string; answer: string; maxScore?: number };

export type AttemptSpecEnvelope = {
  quizId: string;
  quizType: QuizTypeKey;
  contentHash?: string;
  requiresRemoteGrader?: boolean;
  renderSpec: { items: RenderItem[]; totalTimeLimit?: number | null };
  gradingKey: { items: GradingKeyItem[] };
  meta: {
    name: string;
    subject: string;
    subjectColorHex: string;
    topic: string;
    owner: string;
  };
  versionTag?: string;
};

/** ---------- Schedule aggregation types ---------- */
export type ScheduleBreakdownInput = {
  quizDoc: any;
  quizType: QuizTypeKey;
  attempts: Array<{
    _id: Types.ObjectId;
    studentId: Types.ObjectId | string;
    score: number;
    maxScore: number;
    finishedAt: Date;
    answers?: Record<string, any>;
    breakdown?: Array<{
      itemId: string;
      awarded: number;
      max: number;
      meta?: any;
    }>;
  }>;
  openAnswerMinPct?: number;
  topCrosswordAnswerMinPct?: number; // For Crossword.
};

export type ScheduleBreakdownOutput = { kind: QuizTypeKey; data: any };

/** ---------- Small stable content hash helper ---------- */
import crypto from "crypto";
function stableStringify(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((k) => JSON.stringify(k) + ":" + stableStringify(value[k]))
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
export function contentHash(obj: any): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(obj))
    .digest("hex")
    .slice(0, 16);
}

/** ---------- Client answers & grader outputs ---------- */
export type Answer = {
  id?: string;
  itemId?: string;
  value: any;
  timeTakenMs?: number;
};

export type ItemScore = {
  itemId: string;
  max: number;
  auto: { score: number; correct?: boolean; details?: any };
  final: number;
  needsManualReview?: boolean;
};

export type AutoscoreResult = {
  itemScores: ItemScore[];
  total: number;
  max: number;
};

/** ---------- Small coercion helpers ---------- */
export const isString = (x: unknown): x is string => typeof x === "string";
export const toNumber = (x: unknown) => (typeof x === "number" ? x : Number(x));

/** ---------- Small helpers ---------- */

export function normalizeFreeText(v: unknown): string {
  if (v == null) return "";
  const s = String(v)
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return s;
}

export const toPct01 = (num: number, den: number) => (den > 0 ? num / den : 0);
export const pct100 = (x: number | null) => (x == null ? null : x * 100);

/** ---------- Aggregation types ---------- */

export type MCOption = { id: string; text: string; correct: boolean };
export type BasicItem =
  | { id: string; type: "mc"; text: string; options: MCOption[] }
  | { id: string; type: "open"; text: string }
  | { id: string; type: "context"; text: string };

export type RapidItem = {
  id: string;
  type: "mc";
  text: string;
  timeLimit: number;
  options: MCOption[];
};

export type CrosswordEntry = {
  id: string;
  clue?: string;
  // optionally: answer?: string; row?: number; col?: number; dir?: "across"|"down"; length?: number;
};

export type CrosswordQuizDoc = { entries?: CrosswordEntry[] };
export type BasicQuizDoc = { items?: BasicItem[] };
export type RapidQuizDoc = { items?: RapidItem[] };

export type AttemptBreakdownRow = {
  itemId?: string;
  // accept both naming schemes:
  awarded?: number; // optional
  max?: number; // optional
  meta?: any; // e.g. { selected: string[] } or { value: string }
};

export type Attempt = {
  score?: number;
  maxScore?: number;
  finishedAt?: string | Date;
  answers?: Record<string, unknown>;
  breakdown?: AttemptBreakdownRow[];
};
