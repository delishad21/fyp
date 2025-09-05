import { Schema } from "mongoose";
import { QuizBaseModel } from "../quiz-base-model";
import { registerQuizType } from "../quiz-registry";
import {
  ImageMetaSchema,
  MCOptionSchema,
  OpenAnswerSchema,
  isString,
} from "../quiz-shared";

/** items union schema */
const BasicItemSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true, enum: ["mc", "open", "context"] },
    text: { type: String, default: "" },

    // IMPORTANT: allow null; do NOT default to 0
    timeLimit: { type: Number, default: null },

    image: { type: ImageMetaSchema, default: null },
    options: { type: [MCOptionSchema], default: undefined }, // mc only
    answers: { type: [OpenAnswerSchema], default: undefined }, // open only
  },
  { _id: false }
);

const BasicSchema = new Schema(
  {
    items: { type: [BasicItemSchema], default: [] },
  },
  { _id: false }
);

export const BasicQuizModel = QuizBaseModel.discriminator("basic", BasicSchema);

/* ----------------------------- Coercion helpers ---------------------------- */

function coerceMCOption(raw: any) {
  return {
    id: isString(raw?.id) ? raw.id : crypto.randomUUID(),
    text: isString(raw?.text) ? raw.text : "",
    correct: !!raw?.correct,
  };
}

function coerceOpenAnswer(raw: any) {
  return {
    id: isString(raw?.id) ? raw.id : crypto.randomUUID(),
    text: isString(raw?.text) ? raw.text : "",
    caseSensitive: !!raw?.caseSensitive,
  };
}

/**
 * Keep null/undefined/"" as "no limit".
 * Otherwise return a finite number, or null if invalid.
 */
function normalizeTimeLimit(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function coerceBasicItem(raw: any) {
  const id = isString(raw?.id) ? raw.id : crypto.randomUUID();
  const t = raw?.type;

  if (t === "mc") {
    return {
      id,
      type: "mc",
      text: isString(raw?.text) ? raw.text : "",
      timeLimit: normalizeTimeLimit(raw?.timeLimit), // ← keep null if "unlimited"
      image: raw?.image ?? null,
      options: Array.isArray(raw?.options)
        ? raw.options.map(coerceMCOption)
        : [],
    };
  }

  if (t === "open") {
    return {
      id,
      type: "open",
      text: isString(raw?.text) ? raw.text : "",
      timeLimit: normalizeTimeLimit(raw?.timeLimit), // ← keep null if "unlimited"
      image: raw?.image ?? null,
      answers: Array.isArray(raw?.answers)
        ? raw.answers.map(coerceOpenAnswer)
        : [],
    };
  }

  if (t === "context") {
    return {
      id,
      type: "context",
      text: isString(raw?.text) ? raw.text : "",
      image: raw?.image ?? null,
    };
  }

  return null;
}

/* -------------------------------- Validation ------------------------------- */

function validateBasic(body: any, items: any[]) {
  const fieldErrors: Record<string, string | string[] | undefined> = {};

  if (!body?.name?.trim()) fieldErrors.name = "Name is required";
  if (!body?.subject?.trim()) fieldErrors.subject = "Subject is required";
  if (!body?.topic?.trim()) fieldErrors.topic = "Topic is required";

  const questionErrors = items.map((it) => {
    const errs: string[] = [];

    if (it.type === "mc") {
      if (!it.text?.trim()) errs.push("Question text is required");

      // Allow unlimited when null/undefined/""
      const tRaw = it.timeLimit;
      if (
        !(
          tRaw === null ||
          tRaw === undefined ||
          (typeof tRaw === "string" && tRaw.trim() === "")
        )
      ) {
        const t = Number(tRaw);
        if (!Number.isFinite(t) || t < 5)
          errs.push("Time limit must be at least 5");
      }

      if (!Array.isArray(it.options) || it.options.length < 1)
        errs.push("Add at least one option");
      it.options?.forEach((o: any, i: number) => {
        if (!o.text?.trim()) errs.push(`Option ${i + 1} text is required`);
      });
      const correctCount =
        it.options?.filter((o: any) => o.correct).length ?? 0;
      if (correctCount < 1) errs.push("Mark at least one option correct");
    } else if (it.type === "open") {
      if (!it.text?.trim()) errs.push("Question text is required");

      // Allow unlimited when null/undefined/""
      const tRaw = it.timeLimit;
      if (
        !(
          tRaw === null ||
          tRaw === undefined ||
          (typeof tRaw === "string" && tRaw.trim() === "")
        )
      ) {
        const t = Number(tRaw);
        if (!Number.isFinite(t) || t < 5)
          errs.push("Time limit must be at least 5");
      }

      if (!Array.isArray(it.answers) || it.answers.length < 1)
        errs.push("Add at least one accepted answer");
      it.answers?.forEach((a: any, i: number) => {
        if (!a.text?.trim()) errs.push(`Answer ${i + 1} text is required`);
      });
    } else if (it.type === "context") {
      if (!it.text?.trim()) errs.push("Context text is required");
    }

    return errs.length ? errs : undefined;
  });

  return { fieldErrors, questionErrors };
}

/* --------------------------- Body readers / files --------------------------- */

function readItemsFromBody(body: any) {
  try {
    const src = body.itemsJson ?? body.questionsJson ?? "[]";
    const parsed = typeof src === "string" ? JSON.parse(src) : src;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildTypePatch(_body: any, items: any[]) {
  return { items };
}

/* -------------------------------- Register --------------------------------- */

export function registerBasicQuiz() {
  registerQuizType({
    type: "basic",
    Model: BasicQuizModel,
    readItemsFromBody,
    coerceItems: (raw) => raw.map(coerceBasicItem).filter(Boolean) as any[],
    validate: validateBasic,
    buildTypePatch,
  });
}
