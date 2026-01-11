/**
 * Quiz Type: CROSSWORD
 * Responsibilities:
 *  - Discriminator schema for crossword quizzes
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
  contentHash,
  CrosswordEntry,
  isString,
  ItemScore,
  normalizeFreeText,
  pct100,
  QuizTypeKey,
  RenderItem,
  ScheduleBreakdownInput,
  toPct01,
} from "../quiz-shared";
import { scoreCrossword_Word } from "../../utils/scoring-helpers";

/* ───────────────────────────── 2) SCHEMAS ──────────────────────────────── */

const CrosswordEntrySchema = new Schema(
  {
    id: { type: String, required: true },
    answer: { type: String, required: true, trim: true },
    clue: { type: String, required: true, trim: true },
    positions: {
      type: [{ row: Number, col: Number }],
      default: [], // populated when placed in grid editor
    },
    direction: { type: String, enum: ["across", "down"], default: null },
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

/* ─────────────────────────── 3) COERCION HELPERS ───────────────────────── */

function coerceEntry(raw: any) {
  // normalize direction precisely to the union or null
  const dir =
    raw?.direction === "across"
      ? "across"
      : raw?.direction === "down"
      ? "down"
      : null;

  // normalize positions to [{row:number, col:number}]
  const positions = Array.isArray(raw?.positions)
    ? raw.positions
        .map((p: any) => ({
          row: Number.isFinite(Number(p?.row)) ? Number(p.row) : NaN,
          col: Number.isFinite(Number(p?.col)) ? Number(p.col) : NaN,
        }))
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

/** Keep null/undefined/"" as null; otherwise finite number or null. */
function normalizeTotalTimeLimit(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ───────────────────────────── 4) VALIDATION ───────────────────────────── */

function validateCrossword(body: any, entries: any[]) {
  const fieldErrors: Record<string, string | string[] | undefined> = {};

  if (!body?.name?.trim()) fieldErrors.name = "Name is required";
  if (!body?.subject?.trim()) fieldErrors.subject = "Subject is required";
  if (!body?.topic?.trim()) fieldErrors.topic = "Topic is required";

  // Allow unlimited when null; only validate if numeric
  const ttl = normalizeTotalTimeLimit(body?.totalTimeLimit);
  if (ttl !== null) {
    if (!Number.isFinite(ttl) || ttl < 5) {
      fieldErrors.totalTimeLimit = "Total time must be at least 5 seconds";
    }
  }

  if (entries.length < 1)
    fieldErrors.entries = "At least one entry is required";

  const questionErrors = entries.map((e) => {
    const errs: string[] = [];
    if (!e.answer?.trim()) errs.push("Answer is required");
    if (!e.clue?.trim()) errs.push("Clue is required");
    return errs.length ? errs : undefined;
  });

  return { fieldErrors, questionErrors };
}

/* ─────────────────────── 5) BODY READER / TYPE PATCH ────────────────────── */

function readItemsFromBody(body: any) {
  try {
    const src = body.entriesJson ?? "[]";
    const parsed = typeof src === "string" ? JSON.parse(src) : src;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(coerceEntry);
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

/* ─────────────────────── 6) ATTEMPT SPEC BUILDER ───────────────────────── */

function buildAttemptSpecCrossword(quizDoc: any): AttemptSpecEnvelope {
  const renderCrossword: RenderItem = {
    kind: "crossword",
    id: "crossword",
    grid: quizDoc.grid ?? undefined,
    entries: (quizDoc.entries ?? []).map((e: any) => ({
      id: e.id,
      clue: e.clue ?? "",
      positions: Array.isArray(e.positions) ? e.positions : [],
      direction: e.direction ?? null,
    })),
  };

  const gradingItems = (quizDoc.entries ?? []).map((e: any) => ({
    kind: "crossword" as const,
    id: e.id,
    answer: String(e.answer ?? ""),
    maxScore: 1,
  }));

  return {
    quizId: String(quizDoc._id),
    quizRootId: String(quizDoc.rootQuizId),
    quizVersion: Number(quizDoc.version),
    quizType: quizDoc.quizType as QuizTypeKey,
    contentHash: contentHash({
      entries: quizDoc.entries,
      grid: quizDoc.grid,
      totalTimeLimit: quizDoc.totalTimeLimit,
    }),
    renderSpec: {
      totalTimeLimit: quizDoc.totalTimeLimit,
      items: [renderCrossword],
    },
    gradingKey: { items: gradingItems },
  };
}

/* ─────────────────────────────── 7) GRADING ─────────────────────────────── */

function gradeAttemptCrossword(
  spec: AttemptSpecEnvelope,
  answers: Answer[]
): AutoscoreResult {
  // Accept either:
  //  (a) a single map answer { [entryId]: string }, or
  //  (b) array of answers with id/itemId + value
  const map: Record<string, string> = (() => {
    if (
      answers.length === 1 &&
      answers[0] &&
      typeof answers[0].value === "object" &&
      !Array.isArray(answers[0].value)
    ) {
      return answers[0].value as Record<string, string>;
    }
    const m: Record<string, string> = {};
    for (const a of answers) {
      const key = (a.id ?? a.itemId) as string;
      m[key] = String(a.value ?? "");
    }
    return m;
  })();

  const itemScores: ItemScore[] = [];
  let total = 0,
    max = 0;

  for (const k of spec.gradingKey.items) {
    if (k.kind !== "crossword") continue;

    const itemMax = Number(k.maxScore ?? 1);
    const given = String(map[k.id] ?? "");
    const out = scoreCrossword_Word(given, k.answer, itemMax);
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

/**
 * Crossword: overall + per-entry stats in quiz order.
 * - Derives *top submitted answers* directly from attempt.answers["crossword"]
 *   (no need for breakdown[*].meta.value).
 * - Adds `expected` (correct answer) per item using the quiz doc entries.
 */
export function aggregateScheduledCrossword({
  quizDoc,
  attempts,
  topCrosswordAnswerMinPct = 0.05,
}: ScheduleBreakdownInput): {
  kind: "crossword";
  data: {
    attemptsCount: number;
    overallAvgScore: number | null; // 0..1
    overallAvgScorePct: number | null; // 0..100
    overallAvgScoreRaw?: { meanScore: number; meanMax: number };
    items: Array<{
      entryId: string;
      clue: string;
      expected: string; // ← correct answer
      totalAttempts: number; // attempts that had a breakdown row for this entry
      perQuestionAvg: number | null; // 0..1
      perQuestionAvgPct: number | null; // 0..100
      correctPct: number; // 0..1
      correctPctPct: number; // 0..100
      answers?: { value: string; count: number; pct: number; pctPct: number }[];
    }>;
  };
} {
  type Entry = {
    id: string;
    clue: string;
    answer?: string;
    // ... positions/direction not needed for aggregation
  };

  const entries = Array.isArray(quizDoc?.entries)
    ? (quizDoc.entries as Entry[])
    : [];
  const entryById = new Map<string, Entry>();
  for (const e of entries) entryById.set(String(e.id), e);

  // ---- Overall attempt-level averages (same as before)
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

  // ---- Per-entry accumulators (from breakdown for scoring / correctness)
  const qScoreSum = new Map<string, number>(); // Σ awarded
  const qMaxSum = new Map<string, number>(); // Σ max
  const correctCount = new Map<string, number>();
  const attemptsPerEntry = new Map<string, number>(); // rows that had this entry in breakdown

  // New: answer tallies from `answers.crossword`
  const answerCounts = new Map<string, Map<string, number>>(); // entryId -> (normalizedAnswer -> count)
  function accAnswer(entryId: string, raw: unknown) {
    if (!entryById.has(entryId)) return;
    const v = String(raw ?? "");
    const norm = normalizeFreeText(v);
    if (!answerCounts.has(entryId)) answerCounts.set(entryId, new Map());
    const m = answerCounts.get(entryId)!;
    m.set(norm, (m.get(norm) || 0) + 1);
  }

  for (const a of attempts) {
    // A) consume breakdown for scoring aggregates
    if (Array.isArray(a.breakdown)) {
      for (const row of a.breakdown) {
        const entryId = String(row.itemId ?? "");
        if (!entryId || !entryById.has(entryId)) continue;

        const scr = Number(row.awarded ?? 0);
        const mx = Number(row.max ?? 0);
        if (!(mx >= 0)) continue;

        qScoreSum.set(entryId, (qScoreSum.get(entryId) || 0) + scr);
        qMaxSum.set(entryId, (qMaxSum.get(entryId) || 0) + mx);
        attemptsPerEntry.set(entryId, (attemptsPerEntry.get(entryId) || 0) + 1);

        const pct = mx > 0 ? scr / mx : 0;
        if (pct >= 0.999) {
          correctCount.set(entryId, (correctCount.get(entryId) || 0) + 1);
        }
      }
    }

    // B) derive submitted values from answers.crossword
    const map =
      a?.answers && typeof a.answers === "object"
        ? (a.answers as any)["crossword"]
        : undefined;

    if (map && typeof map === "object") {
      for (const [entryId, raw] of Object.entries(map)) {
        // Note: do not guard by breakdown presence; we want *submitted* answers,
        // even if an older attempt’s breakdown missed a row.
        accAnswer(String(entryId), raw);
      }
    }
  }

  // ---- Build items in quiz order
  const items = entries.map((e: Entry) => {
    const entryId = String(e.id);
    const clue = e.clue ?? "";
    const expected = String(e.answer ?? ""); // expose correct answer

    const totalAttempts = attemptsPerEntry.get(entryId) || 0;
    const qSum = qScoreSum.get(entryId) || 0;
    const qMax = qMaxSum.get(entryId) || 0;

    const perQuestionAvg = qMax > 0 ? qSum / qMax : null;
    const perQuestionAvgPct =
      perQuestionAvg == null ? null : perQuestionAvg * 100;

    const correct = correctCount.get(entryId) || 0;
    const correctPct = toPct01(correct, totalAttempts);
    const correctPctPct = correctPct * 100;

    // “Top answers” from answerCounts
    let answers:
      | { value: string; count: number; pct: number; pctPct: number }[]
      | undefined;
    const ac = answerCounts.get(entryId);
    if (ac) {
      const totalForPct = Array.from(ac.values()).reduce((s, c) => s + c, 0);
      if (totalForPct > 0) {
        answers = Array.from(ac.entries())
          .map(([value, count]) => {
            const p01 = toPct01(count, totalForPct);
            return { value, count, pct: p01, pctPct: p01 * 100 };
          })
          .filter((r) => r.pct >= topCrosswordAnswerMinPct)
          .sort((a, b) => b.pct - a.pct);
        if (answers.length === 0) answers = undefined;
      }
    }

    return {
      entryId,
      clue,
      expected, // ← correct answer included
      totalAttempts,
      perQuestionAvg,
      perQuestionAvgPct,
      correctPct,
      correctPctPct,
      ...(answers ? { answers } : {}),
    };
  });

  return {
    kind: "crossword",
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

/* ─────────────────────────── 9) REGISTER TYPE ───────────────────────────── */

export function registerCrosswordQuiz() {
  registerQuizType({
    type: "crossword",
    Model: CrosswordQuizModel,
    readItemsFromBody,
    coerceItems: (raw) => raw.map(coerceEntry).filter(Boolean) as any[],
    validate: validateCrossword,
    buildTypePatch,
    buildAttemptSpec: buildAttemptSpecCrossword,
    gradeAttempt: gradeAttemptCrossword,
    aggregateScheduledQuiz: aggregateScheduledCrossword,
  });
}
