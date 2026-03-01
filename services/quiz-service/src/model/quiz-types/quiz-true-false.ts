import { Schema } from "mongoose";
import crypto from "crypto";
import { QuizBaseModel } from "../quiz-base-model";
import { registerQuizType } from "../quiz-registry";
import {
  Answer,
  AttemptSpecEnvelope,
  AutoscoreResult,
  ImageMetaSchema,
  ItemScore,
  contentHash,
} from "../quiz-shared";
import { scoreMC_StrictPartial } from "../../utils/scoring-helpers";
import { aggregateScheduledRapid } from "./quiz-rapid";

type TrueFalseItem = {
  id: string;
  type: "mc";
  text: string;
  timeLimit: number;
  image: any | null;
  options: Array<{ id: string; text: string; correct: boolean }>;
};

const TrueFalseItemSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, enum: ["mc"], required: true },
    text: { type: String, default: "" },
    timeLimit: { type: Number, required: true },
    image: { type: ImageMetaSchema, default: null },
    options: {
      type: [
        new Schema(
          {
            id: { type: String, required: true },
            text: { type: String, required: true },
            correct: { type: Boolean, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { _id: false }
);

const TrueFalseSchema = new Schema(
  {
    items: { type: [TrueFalseItemSchema], default: [] },
  },
  { _id: false }
);

export const TrueFalseQuizModel = QuizBaseModel.discriminator(
  "true-false",
  TrueFalseSchema
);

function toNumber(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toCanonicalTrueFalseOptions(raw: any, questionId: string) {
  // Accept either an explicit correctAnswer boolean or option arrays.
  const explicitCorrect =
    typeof raw?.correctAnswer === "boolean"
      ? raw.correctAnswer
      : typeof raw?.answer === "boolean"
      ? raw.answer
      : undefined;

  if (explicitCorrect !== undefined) {
    return [
      { id: `${questionId}:true`, text: "True", correct: explicitCorrect },
      { id: `${questionId}:false`, text: "False", correct: !explicitCorrect },
    ];
  }

  const incoming = Array.isArray(raw?.options) ? raw.options : [];
  const normalized: Array<{ text: string; correct: boolean }> = incoming.map(
    (o: any) => ({
      text: String(o?.text ?? "").trim().toLowerCase(),
      correct: !!o?.correct,
    })
  );

  const trueOpt = normalized.find((o) => o.text === "true");
  const falseOpt = normalized.find((o) => o.text === "false");

  if (trueOpt || falseOpt) {
    const trueCorrect = !!trueOpt?.correct;
    const falseCorrect = !!falseOpt?.correct;
    if (trueCorrect !== falseCorrect) {
      return [
        { id: `${questionId}:true`, text: "True", correct: trueCorrect },
        { id: `${questionId}:false`, text: "False", correct: falseCorrect },
      ];
    }
  }

  return [
    { id: `${questionId}:true`, text: "True", correct: true },
    { id: `${questionId}:false`, text: "False", correct: false },
  ];
}

function coerceTrueFalseItem(raw: any): TrueFalseItem | null {
  const id = typeof raw?.id === "string" ? raw.id : crypto.randomUUID();
  const text = String(raw?.text ?? "");
  const timeLimit = Math.max(5, Math.floor(toNumber(raw?.timeLimit, 10)));

  return {
    id,
    type: "mc",
    text,
    timeLimit,
    image: raw?.image ?? null,
    options: toCanonicalTrueFalseOptions(raw, id),
  };
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

function validateTrueFalse(body: any, items: any[]) {
  const fieldErrors: Record<string, string | string[] | undefined> = {};
  if (!body?.name?.trim()) fieldErrors.name = "Name is required";
  if (!body?.subject?.trim()) fieldErrors.subject = "Subject is required";
  if (!body?.topic?.trim()) fieldErrors.topic = "Topic is required";

  if (!Array.isArray(items) || items.length < 1) {
    fieldErrors.items = "At least one true/false question is required";
  }

  const questionErrors = (items ?? []).map((it) => {
    const errs: string[] = [];
    if (!it?.text?.trim()) errs.push("Question text is required");
    const t = Number(it?.timeLimit);
    if (!Number.isFinite(t) || t < 5) {
      errs.push("Time limit must be at least 5 seconds");
    }
    if (!Array.isArray(it?.options) || it.options.length !== 2) {
      errs.push("True/False requires exactly 2 options");
    }

    const lower = (it?.options ?? []).map((o: any) =>
      String(o?.text ?? "")
        .trim()
        .toLowerCase()
    );
    const hasTrue = lower.includes("true");
    const hasFalse = lower.includes("false");
    if (!hasTrue || !hasFalse) {
      errs.push("Options must be exactly “True” and “False”");
    }

    const correctCount =
      Array.isArray(it?.options) && it.options.length
        ? it.options.filter((o: any) => !!o.correct).length
        : 0;
    if (correctCount !== 1) {
      errs.push("Exactly one correct answer is required");
    }
    return errs.length ? errs : undefined;
  });

  return { fieldErrors, questionErrors };
}

function buildTypePatch(_body: any, items: any[]) {
  return { items };
}

function buildAttemptSpecTrueFalse(quizDoc: any): AttemptSpecEnvelope {
  const renderItems: AttemptSpecEnvelope["renderSpec"]["items"] = [];
  const gradingItems: AttemptSpecEnvelope["gradingKey"]["items"] = [];

  for (const it of quizDoc.items ?? []) {
    const options = Array.isArray(it?.options) ? it.options : [];

    renderItems.push({
      kind: "mc",
      id: it.id,
      text: String(it.text ?? ""),
      timeLimit: Number(it.timeLimit),
      image: it.image ?? null,
      options: options.map((o: any) => ({
        id: String(o.id),
        text: String(o.text ?? ""),
      })),
    });

    gradingItems.push({
      kind: "mc",
      id: it.id,
      correctOptionIds: options
        .filter((o: any) => !!o.correct)
        .map((o: any) => String(o.id)),
      maxScore: 1,
    });
  }

  return {
    quizId: String(quizDoc._id),
    quizRootId: String(quizDoc.rootQuizId),
    quizVersion: Number(quizDoc.version),
    quizType: quizDoc.quizType,
    contentHash: contentHash({ items: quizDoc.items }),
    renderSpec: { items: renderItems },
    gradingKey: { items: gradingItems },
  };
}

function gradeAttemptTrueFalse(
  spec: AttemptSpecEnvelope,
  answers: Answer[]
): AutoscoreResult {
  const ansById = new Map(answers.map((a) => [(a.id ?? a.itemId)!, a]));
  const itemScores: ItemScore[] = [];
  let total = 0;
  let max = 0;

  for (const k of spec.gradingKey.items) {
    if (k.kind !== "mc") continue;

    const itemMax = Number(k.maxScore ?? 1);
    const ans = ansById.get(k.id);
    const selected = Array.isArray(ans?.value)
      ? (ans!.value as string[])
      : typeof ans?.value === "string"
      ? [String(ans!.value)]
      : [];

    const out = scoreMC_StrictPartial(selected, k.correctOptionIds ?? [], itemMax);
    const final = out.score;

    itemScores.push({
      itemId: k.id,
      max: itemMax,
      auto: { score: out.score, correct: out.correct, details: out.details },
      final,
    });
    total += final;
    max += itemMax;
  }

  return { itemScores, total, max };
}

export const TRUE_FALSE_QUIZ_AI_METADATA = {
  description: "Rapid-style quiz with only True/False responses",
  schema: {
    name: { type: "string", required: true },
    subject: { type: "string", required: true },
    topic: { type: "string", required: true },
    items: {
      type: "array",
      required: true,
      schema: {
        type: { type: "string", value: "mc", required: true },
        id: { type: "string", required: true },
        text: { type: "string", required: true },
        timeLimit: { type: "number", required: true, min: 5, max: 60 },
        options: {
          type: "array",
          required: true,
          exactItems: 2,
          fixedValues: ["True", "False"],
        },
      },
    },
  },
  validation: {
    answerMode: "True/False only",
    maxItems: 20,
    minItems: 1,
  },
  aiPromptingRules: {
    systemPrompt:
      "Create fast true/false questions for primary school students.",
    formatInstructions: `Return a valid JSON object with this structure:
{
  "name": "Quiz Title",
  "subject": "Subject Name",
  "topic": "Topic Name",
  "items": [
    {
      "type": "mc",
      "id": "item-1",
      "text": "Statement text",
      "timeLimit": 10,
      "image": null,
      "options": [
        { "id": "item-1:true", "text": "True", "correct": true },
        { "id": "item-1:false", "text": "False", "correct": false }
      ]
    }
  ]
}

CRITICAL RULES:
- items must be a flat array directly under the root object (do not nest under another key)
- each item must have non-empty "text"
- each item must include exactly 2 options: "True" and "False"
- exactly one option must be marked correct
- use boolean true/false for "correct" (not strings)
- ensure answer-key balance across the quiz: include both True-correct and False-correct items
- do not make all items True-correct or all items False-correct
- do not include batch numbering/progress markers in "name" or "topic"`,
    examples: [
      {
        type: "mc",
        id: "item-1",
        text: "The Earth revolves around the Sun.",
        timeLimit: 10,
        options: [
          { id: "item-1:true", text: "True", correct: true },
          { id: "item-1:false", text: "False", correct: false },
        ],
      },
    ],
  },
};

export function registerTrueFalseQuiz() {
  registerQuizType({
    type: "true-false",
    Model: TrueFalseQuizModel,
    readItemsFromBody,
    coerceItems: (raw) => raw.map(coerceTrueFalseItem).filter(Boolean) as any[],
    validate: validateTrueFalse,
    buildTypePatch,
    buildAttemptSpec: buildAttemptSpecTrueFalse,
    gradeAttempt: gradeAttemptTrueFalse,
    aggregateScheduledQuiz: aggregateScheduledRapid as any,
  });
}
