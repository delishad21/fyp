import { Schema } from "mongoose";
import { QuizBaseModel } from "../quiz-base-model";
import { registerQuizType } from "../quiz-registry";
import { isString } from "../quiz-shared";

const CrosswordEntrySchema = new Schema(
  {
    id: { type: String, required: true },
    answer: { type: String, required: true, trim: true },
    clue: { type: String, required: true, trim: true },
    positions: {
      type: [{ row: Number, col: Number }],
      default: [], // filled when user places in grid editor
    },
    direction: {
      type: String,
      enum: ["across", "down"],
      default: null,
    },
  },
  { _id: false }
);

const CrosswordSchema = new Schema(
  {
    totalTimeLimit: { type: Number, default: null },
    entries: { type: [CrosswordEntrySchema], default: [] },

    grid: {
      type: [[{ letter: String, isBlocked: Boolean }]],
      default: undefined, // saved if user edits layout
    },
  },
  { _id: false }
);

export const CrosswordQuizModel = QuizBaseModel.discriminator(
  "crossword",
  CrosswordSchema
);

/* ------------------------------ helpers ---------------------------------- */

// services/quiz-service/src/models/quiz-types/quiz-crossword.ts

function coerceEntry(raw: any) {
  // normalize direction precisely to the union or null
  const dir =
    raw?.direction === "across"
      ? "across"
      : raw?.direction === "down"
      ? "down"
      : null;

  // normalize positions to [{row:number, col:number}][]
  const positions = Array.isArray(raw?.positions)
    ? raw.positions
        .map((p: any) => ({
          row: Number.isFinite(Number(p?.row)) ? Number(p.row) : 0,
          col: Number.isFinite(Number(p?.col)) ? Number(p.col) : 0,
        }))
        // optionally drop invalids if you prefer strictness:
        .filter((p: any) => Number.isFinite(p.row) && Number.isFinite(p.col))
    : [];

  return {
    id: isString(raw?.id) ? raw.id : crypto.randomUUID(),
    answer: isString(raw?.answer) ? raw.answer : "",
    clue: isString(raw?.clue) ? raw.clue : "",
    direction: dir,
    positions,
  };
}

/** Keep null/undefined/"" as null. Otherwise return finite number or null. */
function normalizeTotalTimeLimit(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------ validation ------------------------------- */

function validateCrossword(body: any, entries: any[]) {
  const fieldErrors: Record<string, string | string[] | undefined> = {};

  if (!body?.name?.trim()) fieldErrors.name = "Name is required";
  if (!body?.subject?.trim()) fieldErrors.subject = "Subject is required";
  if (!body?.topic?.trim()) fieldErrors.topic = "Topic is required";

  // Allow unlimited when null; only validate if it's a number
  const ttl = normalizeTotalTimeLimit(body?.totalTimeLimit);
  if (ttl !== null) {
    if (!Number.isFinite(ttl) || ttl < 5) {
      fieldErrors.totalTimeLimit = "Total time must be at least 5 seconds";
    }
  }

  if (entries.length < 1) {
    fieldErrors.entries = "At least one entry is required";
  }

  const questionErrors = entries.map((e) => {
    const errs: string[] = [];
    if (!e.answer?.trim()) errs.push("Answer is required");
    if (!e.clue?.trim()) errs.push("Clue is required");
    return errs.length ? errs : undefined;
  });

  return { fieldErrors, questionErrors };
}

/* ---------------------------- body / patching ----------------------------- */

function readItemsFromBody(body: any) {
  try {
    const src = body.entriesJson ?? "[]";
    const parsed = typeof src === "string" ? JSON.parse(src) : src;
    if (!Array.isArray(parsed)) return [];

    return parsed.map((raw) => ({
      id: isString(raw?.id) ? raw.id : crypto.randomUUID(),
      answer: isString(raw?.answer) ? raw.answer : "",
      clue: isString(raw?.clue) ? raw.clue : "",
      positions: Array.isArray(raw?.positions) ? raw.positions : [],
      direction:
        raw?.direction === "across" || raw?.direction === "down"
          ? raw.direction
          : null,
    }));
  } catch {
    return [];
  }
}

function buildTypePatch(body: any, entries: any[]) {
  let grid: any[][] | undefined = undefined;

  try {
    if (body.gridJson) {
      const parsed =
        typeof body.gridJson === "string"
          ? JSON.parse(body.gridJson)
          : body.gridJson;
      if (Array.isArray(parsed)) grid = parsed;
    }
  } catch {
    grid = undefined;
  }

  return {
    totalTimeLimit: normalizeTotalTimeLimit(body?.totalTimeLimit),
    entries,
    ...(grid ? { grid } : {}), // only attach if present
  };
}

/* -------------------------------- register -------------------------------- */

export function registerCrosswordQuiz() {
  registerQuizType({
    type: "crossword",
    Model: CrosswordQuizModel,
    readItemsFromBody,
    coerceItems: (raw) => raw.map(coerceEntry).filter(Boolean) as any[],
    validate: validateCrossword,
    buildTypePatch,
  });
}
