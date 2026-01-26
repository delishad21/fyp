/**
 * Quiz Type: RAPID
 * Responsibilities:
 *  - Discriminator schema for rapid MC quizzes
 *  - Body readers/coercion/validation
 *  - Attempt spec builder (render + grading key)
 *  - Grader
 *  - Scheduled-quiz aggregation
 *
 * Section order (keep across types):
 *  1) Imports
 *  2) Schemas
 *  3) Coercion helpers
 *  4) Validation
 *  5) Body readers / type patch
 *  6) Attempt spec builder
 *  7) Grading
 *  8) Scheduled aggregation
 *  9) Register function
 */

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
  MCOptionSchema,
  RapidItem,
  ScheduleBreakdownInput,
  contentHash,
  isString,
  pct100,
  toNumber,
  toPct01,
} from "../quiz-shared";
import { scoreMC_StrictPartial } from "../../utils/scoring-helpers";

/* ───────────────────────────── 2) SCHEMAS ──────────────────────────────── */

const RapidItemSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, enum: ["mc"], required: true },
    text: { type: String, default: "" },
    timeLimit: { type: Number, required: true },
    image: { type: ImageMetaSchema, default: null },
    options: { type: [MCOptionSchema], default: [] },
  },
  { _id: false },
);

const RapidSchema = new Schema(
  {
    items: { type: [RapidItemSchema], default: [] },
  },
  { _id: false },
);

export const RapidQuizModel = QuizBaseModel.discriminator("rapid", RapidSchema);

/* ─────────────────────────── 3) COERCION HELPERS ───────────────────────── */

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

/* ───────────────────────────── 4) VALIDATION ───────────────────────────── */

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

/* ─────────────────────── 5) BODY READER / TYPE PATCH ────────────────────── */

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
  _fileMap?: Record<string, any>,
) {
  return { items };
}

/* ─────────────────────── 6) ATTEMPT SPEC BUILDER ───────────────────────── */

function buildAttemptSpecRapid(quizDoc: any): AttemptSpecEnvelope {
  const renderItems: AttemptSpecEnvelope["renderSpec"]["items"] = [];
  const gradingItems: AttemptSpecEnvelope["gradingKey"]["items"] = [];

  for (const it of quizDoc.items ?? []) {
    renderItems.push({
      kind: "mc",
      id: it.id,
      text: it.text ?? "",
      timeLimit: Number(it.timeLimit),
      image: it.image ?? null,
      options: (it.options ?? []).map((o: any) => ({
        id: o.id,
        text: o.text ?? "",
      })),
    });
    gradingItems.push({
      kind: "mc",
      id: it.id,
      correctOptionIds: (it.options ?? [])
        .filter((o: any) => !!o.correct)
        .map((o: any) => o.id),
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

/* ─────────────────────────────── 7) GRADING ─────────────────────────────── */

function gradeAttemptRapid(
  spec: AttemptSpecEnvelope,
  answers: Answer[],
): AutoscoreResult {
  const ansById = new Map(answers.map((a) => [(a.id ?? a.itemId)!, a]));
  const itemScores: ItemScore[] = [];
  let total = 0,
    max = 0;

  for (const k of spec.gradingKey.items) {
    if (k.kind !== "mc") continue;

    const itemMax = Number(k.maxScore ?? 1);
    const ans = ansById.get(k.id);
    const selected = Array.isArray(ans?.value)
      ? (ans!.value as string[])
      : typeof ans?.value === "string"
        ? [String(ans!.value)]
        : [];

    const out = scoreMC_StrictPartial(
      selected,
      k.correctOptionIds ?? [],
      itemMax,
    );

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

/* ──────────────────────── 8) SCHEDULED AGGREGATION ─────────────────────── */

function getCorrectOptionIdsFromItem(it: any): string[] {
  if (Array.isArray(it?.correctOptionIds))
    return it.correctOptionIds.map(String);
  if (it?.correctOptionId) return [String(it.correctOptionId)];
  if (it?.correct) return [String(it.correct)];
  const opts = Array.isArray(it?.options) ? it.options : [];
  const truthy = (v: any) => v === true || v === 1 || v === "1" || v === "true";
  return opts
    .filter(
      (o: any) =>
        truthy(o?.correct) ||
        truthy(o?.isCorrect) ||
        truthy(o?.answer) ||
        truthy(o?.isAnswer),
    )
    .map((o: any) => String(o.id));
}

export function aggregateScheduledRapid({
  quizDoc,
  attempts,
}: ScheduleBreakdownInput): {
  kind: "rapid";
  data: {
    attemptsCount: number;
    overallAvgScore: number | null;
    overallAvgScorePct: number | null;
    overallAvgScoreRaw?: { meanScore: number; meanMax: number };
    items: Array<{
      itemId: string;
      type: "mc";
      text: string;
      timeLimit: number | null;
      totalAnswers: number;
      perQuestionAvg: number | null;
      perQuestionAvgPct: number | null;
      correctOptionIds: string[];
      correctOptions: { id: string; text: string }[];
      options: {
        id: string;
        text: string;
        count: number;
        percentageSelected: number;
        percentageSelectedPct: number;
      }[];
    }>;
  };
} {
  const itemsArr: RapidItem[] = Array.isArray(quizDoc?.items)
    ? quizDoc.items
    : [];
  const itemById = new Map<string, RapidItem>();
  for (const it of itemsArr) itemById.set(String(it.id), it);

  // Overall averages
  const attemptsCount = attempts.length;
  const scored = attempts.filter(
    (a) =>
      typeof a.score === "number" &&
      typeof a.maxScore === "number" &&
      Number(a.maxScore) > 0,
  );
  const sumScore = scored.reduce((s, a) => s + Number(a.score || 0), 0);
  const sumMax = scored.reduce((s, a) => s + Number(a.maxScore || 0), 0);
  const overallAvgScore = scored.length ? sumScore / sumMax : null;

  // Per-question scoring from breakdown
  const qScoreSum = new Map<string, number>();
  const qMaxSum = new Map<string, number>();

  // MC tallies
  const mcCounts = new Map<string, Map<string, number>>();
  const mcTotals = new Map<string, number>();

  for (const a of attempts) {
    if (Array.isArray(a.breakdown)) {
      for (const b of a.breakdown) {
        const itemId = String(b.itemId ?? "");
        const scr = Number(b.awarded ?? 0);
        const mx = Number(b.max ?? 0);
        if (!itemId || !(mx >= 0)) continue;
        qScoreSum.set(itemId, (qScoreSum.get(itemId) || 0) + scr);
        qMaxSum.set(itemId, (qMaxSum.get(itemId) || 0) + mx);
      }
    }

    const ans = (a.answers as Record<string, unknown>) || {};
    for (const [itemId, value] of Object.entries(ans)) {
      const it = itemById.get(itemId);
      if (!it || it.type !== "mc") continue;

      const selected: string[] = Array.isArray(value)
        ? (value as string[])
        : typeof value === "string"
          ? [String(value)]
          : [];

      if (!mcCounts.has(itemId)) mcCounts.set(itemId, new Map());
      const m = mcCounts.get(itemId)!;
      mcTotals.set(itemId, (mcTotals.get(itemId) || 0) + 1);
      for (const optId of selected)
        m.set(String(optId), (m.get(String(optId)) || 0) + 1);
    }
  }

  const items = itemsArr
    .filter((it) => it.type === "mc")
    .map((it) => {
      const itemId = String(it.id);
      const counts = mcCounts.get(itemId) ?? new Map<string, number>();
      const totalAnswers = mcTotals.get(itemId) || 0;

      const qMax = qMaxSum.get(itemId) || 0;
      const qSum = qScoreSum.get(itemId) || 0;
      const perQuestionAvg = qMax > 0 ? qSum / qMax : null;

      const options = (it.options ?? []).map((o) => {
        const count = counts.get(String(o.id)) || 0;
        const p01 = toPct01(count, totalAnswers);
        return {
          id: String(o.id),
          text: o.text ?? "",
          count,
          percentageSelected: p01,
          percentageSelectedPct: p01 * 100,
        };
      });

      const correctOptionIds = getCorrectOptionIdsFromItem(it);
      const correctOptions = (it.options ?? [])
        .filter((o: any) => correctOptionIds.includes(String(o.id)))
        .map((o: any) => ({ id: String(o.id), text: o.text ?? "" }));

      return {
        itemId,
        type: "mc" as const,
        text: it.text ?? "",
        timeLimit: Number.isFinite(Number(it.timeLimit))
          ? Number(it.timeLimit)
          : null,
        totalAnswers,
        perQuestionAvg,
        perQuestionAvgPct: pct100(perQuestionAvg),
        correctOptionIds,
        correctOptions,
        options,
      };
    });

  return {
    kind: "rapid",
    data: {
      attemptsCount,
      overallAvgScore,
      overallAvgScorePct: pct100(overallAvgScore),
      overallAvgScoreRaw: scored.length
        ? {
            meanScore: sumScore / scored.length,
            meanMax: sumMax / scored.length,
          }
        : undefined,
      items,
    },
  };
}

/* ─────────────────────── 9) AI GENERATION METADATA ──────────────────────── */

/**
 * AI Generation Metadata for Rapid Quizzes
 * Schema structure, validation rules, and prompting guidelines
 */
export const RAPID_QUIZ_AI_METADATA = {
  description: "Fast-paced multiple choice quiz with per-question time limits",

  schema: {
    name: { type: "string", required: true },
    subject: { type: "string", required: true },
    topic: { type: "string", required: true },
    items: {
      type: "array",
      required: true,
      description: "Array of rapid MC items with individual time limits",
      schema: {
        type: { type: "string", value: "mc", required: true },
        id: { type: "string", required: true },
        text: { type: "string", required: true },
        timeLimit: {
          type: "number",
          required: true,
          min: 5,
          max: 60,
          description: "Time in seconds for this question",
        },
        image: { type: "object | null" },
        options: {
          type: "array",
          required: true,
          minItems: 2,
          maxItems: 6,
          schema: {
            id: { type: "string", required: true },
            text: { type: "string", required: true },
            correct: { type: "boolean", required: true },
          },
        },
      },
    },
  },

  validation: {
    maxItems: 20,
    minItems: 1,
    maxOptionsPerQuestion: 6,
    minOptionsPerQuestion: 2,
    minTimeLimit: 5,
    maxTimeLimit: 60,
  },

  aiPromptingRules: {
    systemPrompt:
      "You are an expert educational content creator specializing in fast-paced multiple choice assessments for primary school students. Create quick-fire questions that test rapid recall and quick thinking.",

    formatInstructions: `Return a valid JSON object with this structure:
{
  "name": "Quiz Title",
  "subject": "Subject Name",
  "topic": "Topic Name",
  "items": [
    {
      "type": "mc",
      "id": "uuid",
      "text": "Quick question",
      "timeLimit": 10,
      "image": null,
      "options": [
        { "id": "uuid", "text": "Option text", "correct": true }
      ]
    }
  ]
}

CRITICAL RULES:
- ALL questions must have type: "mc" (multiple choice only)
- Each question MUST have a timeLimit between 5-60 seconds
- Shorter timeLimits (5-15s) for simple recall, longer (20-60s) for calculations
- Include 2-6 options per question, at least one must be correct
- Questions should be answerable quickly - avoid long text
- Maximum 20 questions total
- Generate age-appropriate vocabulary and complexity`,

    examples: [
      {
        type: "mc",
        id: "550e8400-e29b-41d4-a716-446655440002",
        text: "Quick: 2 + 2 = ?",
        timeLimit: 10,
        image: null,
        options: [
          { id: "opt1", text: "3", correct: false },
          { id: "opt2", text: "4", correct: true },
          { id: "opt3", text: "5", correct: false },
        ],
      },
    ],
  },
};

/* ─────────────────────────── 10) REGISTER TYPE ──────────────────────────── */

export function registerRapidQuiz() {
  registerQuizType({
    type: "rapid",
    Model: RapidQuizModel,
    readItemsFromBody,
    coerceItems: (raw) => raw.map(coerceRapidItem).filter(Boolean) as any[],
    validate: validateRapid,
    buildTypePatch,
    buildAttemptSpec: buildAttemptSpecRapid,
    gradeAttempt: gradeAttemptRapid,
    aggregateScheduledQuiz: aggregateScheduledRapid,
  });
}
