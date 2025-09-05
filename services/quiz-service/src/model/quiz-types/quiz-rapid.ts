import { Schema } from "mongoose";
import { QuizBaseModel } from "../quiz-base-model";
import { registerQuizType } from "../quiz-registry";
import {
  ImageMetaSchema,
  MCOptionSchema,
  isString,
  toNumber,
} from "../quiz-shared";

const RapidItemSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, enum: ["mc"], required: true },
    text: { type: String, default: "" },
    timeLimit: { type: Number, required: true },
    image: { type: ImageMetaSchema, default: null },
    options: { type: [MCOptionSchema], default: [] },
  },
  { _id: false }
);

const RapidSchema = new Schema(
  {
    items: { type: [RapidItemSchema], default: [] },
  },
  { _id: false }
);

export const RapidQuizModel = QuizBaseModel.discriminator("rapid", RapidSchema);

/** coercion */
function coerceRapidItem(raw: any) {
  if (raw?.type !== "mc") return null;
  return {
    id: isString(raw?.id) ? raw.id : crypto.randomUUID(),
    type: "mc" as const,
    text: isString(raw?.text) ? raw.text : "",
    timeLimit: toNumber(raw?.timeLimit),
    image: raw?.image ?? null,
    options: Array.isArray(raw?.options)
      ? raw.options.map((o: any) => ({
          id: isString(o?.id) ? o.id : crypto.randomUUID(),
          text: isString(o?.text) ? o.text : "",
          correct: !!o?.correct,
        }))
      : [],
  };
}

/** validation (exactly one correct if you want — enforced here) */
function validateRapid(body: any, items: any[]) {
  const fieldErrors: Record<string, string | string[] | undefined> = {};
  if (!body?.name?.trim()) fieldErrors.name = "Name is required";
  if (!body?.subject?.trim()) fieldErrors.subject = "Subject is required";
  if (!body?.topic?.trim()) fieldErrors.topic = "Topic is required";

  const questionErrors = items.map((it) => {
    const errs: string[] = [];
    if (!it.text?.trim()) errs.push("Question text is required");
    const t = Number(it.timeLimit);
    if (!Number.isFinite(t)) errs.push("Time limit is required");
    if (!Array.isArray(it.options) || it.options.length < 2)
      errs.push("At least two options required");
    it.options?.forEach((o: any, i: number) => {
      if (!o.text?.trim()) errs.push(`Option ${i + 1} text is required`);
    });
    const correctCount = it.options?.filter((o: any) => o.correct).length ?? 0;
    if (correctCount !== 1) errs.push("Exactly one correct option required");
    return errs.length ? errs : undefined;
  });

  return { fieldErrors, questionErrors };
}

function readItemsFromBody(body: any) {
  try {
    const src = body.itemsJson ?? body.questionsJson ?? "[]";
    const parsed = typeof src === "string" ? JSON.parse(src) : src;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildTypePatch(
  _body: any,
  items: any[],
  fileMap?: Record<string, any>
) {
  return { items };
}

export function registerRapidQuiz() {
  registerQuizType({
    type: "rapid",
    Model: RapidQuizModel,
    readItemsFromBody,
    coerceItems: (raw) => raw.map(coerceRapidItem).filter(Boolean) as any[],
    validate: validateRapid,
    buildTypePatch,
  });
}
