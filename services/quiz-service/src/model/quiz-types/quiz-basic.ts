/**
 * Quiz Type: BASIC
 * Responsibilities:
 *  - Mongoose discriminator schema for "basic" quizzes
 *  - Body readers/coercion/validation
 *  - Attempt spec builder (render + grading key)
 *  - Grader
 *  - Scheduled-quiz aggregation
 *
 * Section layout (keep this order across quiz-type files for consistency):
 *  1) Imports
 *  2) Schemas (discriminator + item sub-schemas)
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
  BasicItem,
  ImageMetaSchema,
  ItemScore,
  MCOptionSchema,
  OpenAnswerSchema,
  QuizTypeKey,
  ScheduleBreakdownInput,
  contentHash,
  isString,
  pct100,
  toPct01,
} from "../quiz-shared";
import {
  scoreMC_StrictPartial,
  scoreOpen_Exact,
} from "../../utils/scoring-helpers";

/* ───────────────────────────── 2) SCHEMAS ──────────────────────────────── */

/** Union item schema for basic quizzes (mc | open | context) */
const BasicItemSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true, enum: ["mc", "open", "context"] },
    text: { type: String, default: "" },
    image: { type: ImageMetaSchema, default: null },
    options: { type: [MCOptionSchema], default: undefined }, // mc only
    answers: { type: [OpenAnswerSchema], default: undefined }, // open only
  },
  { _id: false }
);

/** Basic quiz has a single global timer (seconds | null). */
const BasicSchema = new Schema(
  {
    totalTimeLimit: { type: Number, default: null }, // seconds; null = no limit
    items: { type: [BasicItemSchema], default: [] },
  },
  { _id: false }
);

export const BasicQuizModel = QuizBaseModel.discriminator("basic", BasicSchema);

/* ─────────────────────────── 3) COERCION HELPERS ───────────────────────── */

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

/** Coerce an incoming raw item to a strictly-shaped item or null if invalid. */
function coerceBasicItem(raw: any) {
  const id = isString(raw?.id) ? raw.id : crypto.randomUUID();
  const t = raw?.type;

  if (t === "mc") {
    return {
      id,
      type: "mc",
      text: isString(raw?.text) ? raw.text : "",
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

/** Keep null/undefined/"" as null; otherwise finite number or null. */
function normalizeTotalTimeLimit(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ───────────────────────────── 4) VALIDATION ───────────────────────────── */

function validateBasic(body: any, items: any[]) {
  const fieldErrors: Record<string, string | string[] | undefined> = {};

  if (!body?.name?.trim()) fieldErrors.name = "Name is required";
  if (!body?.subject?.trim()) fieldErrors.subject = "Subject is required";
  if (!body?.topic?.trim()) fieldErrors.topic = "Topic is required";

  // Global timer (optional): allow null/empty (no limit); else >= 30s
  const ttlRaw = body?.totalTimeLimit;
  if (
    !(ttlRaw === null || ttlRaw === undefined || String(ttlRaw).trim() === "")
  ) {
    const ttl = Number(ttlRaw);
    if (!Number.isFinite(ttl) || ttl < 30) {
      fieldErrors.totalTimeLimit =
        "Total time limit must be at least 30 seconds";
    }
  }

  const questionErrors = items.map((it) => {
    const errs: string[] = [];

    if (it.type === "mc") {
      if (!it.text?.trim()) errs.push("Question text is required");
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

function buildTypePatch(body: any, items: any[]) {
  // Basic uses ONLY a global timer now
  const totalTimeLimit = normalizeTotalTimeLimit(body?.totalTimeLimit);
  return { items, totalTimeLimit };
}

/* ─────────────────────── 6) ATTEMPT SPEC BUILDER ───────────────────────── */

function buildAttemptSpecBasic(quizDoc: any): AttemptSpecEnvelope {
  const renderItems: AttemptSpecEnvelope["renderSpec"]["items"] = [];
  const gradingItems: AttemptSpecEnvelope["gradingKey"]["items"] = [];

  for (const it of quizDoc.items ?? []) {
    if (it.type === "mc") {
      const options = (it.options ?? []).map((o: any) => ({
        id: o.id,
        text: o.text ?? "",
      }));
      const correctOptionIds: string[] = (it.options ?? [])
        .filter((o: any) => !!o.correct)
        .map((o: any) => o.id);

      renderItems.push({
        kind: "mc",
        id: it.id,
        text: it.text ?? "",
        image: it.image ?? null,
        options,
        // multiSelect is true when there are 2+ correct options (MRQ)
        multiSelect: correctOptionIds.length > 1,
      });

      gradingItems.push({
        kind: "mc",
        id: it.id,
        correctOptionIds,
        maxScore: 1,
      });
    } else if (it.type === "open") {
      renderItems.push({
        kind: "open",
        id: it.id,
        text: it.text ?? "",
        image: it.image ?? null,
      });
      gradingItems.push({
        kind: "open",
        id: it.id,
        accepted: (it.answers ?? []).map((a: any) => ({
          text: a.text ?? "",
          caseSensitive: !!a.caseSensitive,
        })),
        maxScore: 1,
      });
    } else if (it.type === "context") {
      renderItems.push({
        kind: "context",
        id: it.id,
        text: it.text ?? "",
        image: it.image ?? null,
      });
    }
  }

  const totalTimeLimit =
    quizDoc.totalTimeLimit === null || quizDoc.totalTimeLimit === undefined
      ? null
      : Number(quizDoc.totalTimeLimit);

  return {
    quizId: String(quizDoc._id),
    quizRootId: String(quizDoc.rootQuizId),
    quizVersion: Number(quizDoc.version),
    quizType: quizDoc.quizType as QuizTypeKey,
    contentHash: contentHash({
      items: quizDoc.items,
      totalTimeLimit,
    }),
    renderSpec: {
      totalTimeLimit,
      items: renderItems,
    },
    gradingKey: { items: gradingItems },
  };
}
/* ─────────────────────────────── 7) GRADING ─────────────────────────────── */

function gradeAttemptBasic(
  spec: AttemptSpecEnvelope,
  answers: Answer[]
): AutoscoreResult {
  const ansById = new Map(answers.map((a) => [(a.id ?? a.itemId)!, a]));
  const itemScores: ItemScore[] = [];
  let total = 0,
    max = 0;

  for (const k of spec.gradingKey.items) {
    switch (k.kind) {
      case "mc": {
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
          itemMax
        );
        const final = out.score;

        itemScores.push({
          itemId: k.id,
          max: itemMax,
          auto: {
            score: out.score,
            correct: out.correct,
            details: out.details,
          },
          final,
        });
        total += final;
        max += itemMax;
        break;
      }

      case "open": {
        const itemMax = Number(k.maxScore ?? 1);
        const ans = ansById.get(k.id);
        const value = String(ans?.value ?? "");

        const out = scoreOpen_Exact(value, k.accepted ?? [], itemMax);
        const final = out.score;

        itemScores.push({
          itemId: k.id,
          max: itemMax,
          auto: {
            score: out.score,
            correct: out.correct,
            details: out.details,
          },
          final,
        });
        total += final;
        max += itemMax;
        break;
      }

      default:
        // basic shouldn't emit other kinds in gradingKey
        break;
    }
  }

  return { itemScores, total, max };
}

/* ──────────────────────── 8) SCHEDULED AGGREGATION ─────────────────────── */

function normalizeFreeText(s: unknown) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

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
        truthy(o?.isAnswer)
    )
    .map((o: any) => String(o.id));
}

export function aggregateScheduledBasic({
  quizDoc,
  attempts,
  openAnswerMinPct = 0.05,
}: ScheduleBreakdownInput): {
  kind: "basic";
  data: {
    attemptsCount: number;
    overallAvgScore: number | null;
    overallAvgScorePct: number | null;
    overallAvgScoreRaw?: { meanScore: number; meanMax: number };
    items: Array<
      | {
          itemId: string;
          type: "mc";
          text: string;
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
        }
      | {
          itemId: string;
          type: "open";
          text: string;
          totalAnswers: number;
          perQuestionAvg: number | null;
          perQuestionAvgPct: number | null;
          threshold: number;
          acceptedAnswers: { text: string; caseSensitive: boolean }[];
          answers: {
            value: string;
            count: number;
            pct: number;
            pctPct: number;
          }[];
        }
      | {
          itemId: string;
          type: string;
          text: string;
          totalAnswers: number;
          perQuestionAvg: number | null;
          perQuestionAvgPct: number | null;
          options: any[];
        }
    >;
  };
} {
  const itemsArr: BasicItem[] = Array.isArray(quizDoc?.items)
    ? quizDoc.items
    : [];
  const itemById = new Map<string, BasicItem>();
  for (const it of itemsArr) itemById.set(String(it.id), it);

  // Overall averages at attempt level
  const attemptsCount = attempts.length;
  const scored = attempts.filter(
    (a) =>
      typeof a.score === "number" &&
      typeof a.maxScore === "number" &&
      Number(a.maxScore) > 0
  );
  const sumScore = scored.reduce((s, a) => s + Number(a.score || 0), 0);
  const sumMax = scored.reduce((s, a) => s + Number(a.maxScore || 0), 0);
  const overallAvgScore = scored.length ? sumScore / sumMax : null;

  // Per-question scoring accumulation from breakdown
  const qScoreSum = new Map<string, number>(); // itemId -> Σ awarded
  const qMaxSum = new Map<string, number>(); // itemId -> Σ max

  // MC tallies
  const mcCounts = new Map<string, Map<string, number>>(); // itemId -> optionId -> count
  const mcTotals = new Map<string, number>(); // itemId -> answers count

  // OPEN tallies
  const openCounts = new Map<string, Map<string, number>>(); // itemId -> normalizedAnswer -> count
  const openTotals = new Map<string, number>(); // itemId -> answers count

  for (const a of attempts) {
    // 1) scoring
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

    // 2) raw answers
    const ans = (a.answers as Record<string, unknown>) || {};
    for (const [itemId, value] of Object.entries(ans)) {
      const it = itemById.get(itemId);
      if (!it) continue;

      if (it.type === "mc") {
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
      } else if (it.type === "open") {
        const key = normalizeFreeText((value as any)?.value ?? value);
        if (!openCounts.has(itemId)) openCounts.set(itemId, new Map());
        const m = openCounts.get(itemId)!;
        openTotals.set(itemId, (openTotals.get(itemId) || 0) + 1);
        m.set(key, (m.get(key) || 0) + 1);
      }
    }
  }

  // Build unified items (quiz order)
  const unified: Array<any> = [];
  for (const it of itemsArr) {
    const itemId = String(it.id);
    const text = it.text ?? "";

    const qMax = qMaxSum.get(itemId) || 0;
    const qSum = qScoreSum.get(itemId) || 0;
    const perQuestionAvg = qMax > 0 ? qSum / qMax : null;

    if (it.type === "mc") {
      const counts = mcCounts.get(itemId) ?? new Map<string, number>();
      const totalAnswers = mcTotals.get(itemId) || 0;

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

      unified.push({
        itemId,
        type: "mc" as const,
        text,
        totalAnswers,
        perQuestionAvg,
        perQuestionAvgPct: pct100(perQuestionAvg),
        correctOptionIds,
        correctOptions,
        options,
      });
    } else if (it.type === "open") {
      const counts = openCounts.get(itemId) ?? new Map<string, number>();
      const totalAnswers = openTotals.get(itemId) || 0;

      const answers = Array.from(counts.entries())
        .map(([value, count]) => {
          const p01 = toPct01(count, totalAnswers);
          return { value, count, pct: p01, pctPct: p01 * 100 };
        })
        .filter((r) => r.pct >= openAnswerMinPct)
        .sort((a, b) => b.pct - a.pct);

      const acceptedAnswers = Array.isArray((it as any).answers)
        ? (it as any).answers.map((a: any) => ({
            text: a?.text ?? "",
            caseSensitive: !!a?.caseSensitive,
          }))
        : [];

      unified.push({
        itemId,
        type: "open" as const,
        text,
        totalAnswers,
        perQuestionAvg,
        perQuestionAvgPct: pct100(perQuestionAvg),
        threshold: openAnswerMinPct,
        acceptedAnswers,
        answers,
      });
    } else {
      unified.push({
        itemId,
        type: it.type ?? "unknown",
        text,
        totalAnswers: 0,
        perQuestionAvg,
        perQuestionAvgPct: pct100(perQuestionAvg),
        options: [],
      });
    }
  }

  return {
    kind: "basic",
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
      items: unified,
    },
  };
}

/* ─────────────────────────── 9) REGISTER TYPE ───────────────────────────── */

/**
 * registerBasicQuiz
 * Registers the "basic" quiz type with the global registry:
 *  - Model (Mongoose discriminator)
 *  - I/O (reader/coercion/validation/patch)
 *  - Attempt spec builder
 *  - Grader
 *  - Scheduled aggregation
 */
export function registerBasicQuiz() {
  registerQuizType({
    type: "basic",
    Model: BasicQuizModel,
    readItemsFromBody,
    coerceItems: (raw) => raw.map(coerceBasicItem).filter(Boolean) as any[],
    validate: validateBasic,
    buildTypePatch,
    buildAttemptSpec: buildAttemptSpecBasic,
    gradeAttempt: gradeAttemptBasic,
    aggregateScheduledQuiz: aggregateScheduledBasic,
  });
}
