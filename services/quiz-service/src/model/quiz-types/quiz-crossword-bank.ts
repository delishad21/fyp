import { Schema } from "mongoose";
import crypto from "crypto";
import { QuizBaseModel } from "../quiz-base-model";
import { registerQuizType } from "../quiz-registry";
import {
  Answer,
  AttemptSpecEnvelope,
  AutoscoreResult,
  ItemScore,
  QuizTypeKey,
  RenderItem,
  ScheduleBreakdownInput,
  contentHash,
  normalizeFreeText,
  pct100,
  toPct01,
} from "../quiz-shared";
import { scoreCrossword_Word } from "../../utils/scoring-helpers";
import {
  InputWord,
  generateCrossword,
} from "../../utils/crossword/crossword-algorithm";
import { packTopLeftAndCrop } from "../../utils/crossword/compact-crossword";

type BankEntry = {
  id: string;
  answer: string;
  clue: string;
};

const CROSSWORD_BANK_MIN_WORDS_PER_QUIZ = 5;
const CROSSWORD_BANK_MAX_WORDS_PER_QUIZ = 10;
const CROSSWORD_BANK_MAX_ENTRIES = 100;

const CrosswordBankEntrySchema = new Schema(
  {
    id: { type: String, required: true },
    answer: { type: String, required: true, trim: true },
    clue: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const CrosswordBankSchema = new Schema(
  {
    totalTimeLimit: { type: Number, default: null },
    wordsPerQuiz: {
      type: Number,
      required: true,
      min: CROSSWORD_BANK_MIN_WORDS_PER_QUIZ,
      max: CROSSWORD_BANK_MAX_WORDS_PER_QUIZ,
      default: 5,
    },
    entriesBank: {
      type: [CrosswordBankEntrySchema],
      default: [],
      validate: [
        (arr: BankEntry[]) =>
          Array.isArray(arr) ? arr.length <= CROSSWORD_BANK_MAX_ENTRIES : true,
        `Word bank can contain at most ${CROSSWORD_BANK_MAX_ENTRIES} entries`,
      ],
    },

    // Schedule variant output (selected subset + generated layout).
    entries: {
      type: [
        new Schema(
          {
            id: { type: String, required: true },
            answer: { type: String, required: true, trim: true },
            clue: { type: String, required: true, trim: true },
            positions: {
              type: [{ row: Number, col: Number }],
              default: [],
            },
            direction: {
              type: String,
              enum: ["across", "down"],
              default: null,
            },
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
    grid: {
      type: [[{ letter: String, isBlocked: Boolean }]],
      default: undefined,
    },
  },
  { _id: false },
);

export const CrosswordBankQuizModel = QuizBaseModel.discriminator(
  "crossword-bank",
  CrosswordBankSchema,
);

function normalizeTotalTimeLimit(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeBankEntry(raw: any): BankEntry {
  return {
    id: typeof raw?.id === "string" ? raw.id : crypto.randomUUID(),
    answer: String(raw?.answer ?? "")
      .trim()
      .toUpperCase(),
    clue: String(raw?.clue ?? "").trim(),
  };
}

function readItemsFromBody(body: any) {
  try {
    const src = body.entriesBankJson ?? body.entriesJson ?? "[]";
    const parsed = typeof src === "string" ? JSON.parse(src) : src;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeBankEntry);
  } catch {
    return [];
  }
}

function validateCrosswordBank(body: any, entriesBank: BankEntry[]) {
  const fieldErrors: Record<string, string | string[] | undefined> = {};

  if (!body?.name?.trim()) fieldErrors.name = "Name is required";
  if (!body?.subject?.trim()) fieldErrors.subject = "Subject is required";
  if (!body?.topic?.trim()) fieldErrors.topic = "Topic is required";

  const wordsPerQuiz = Math.floor(Number(body?.wordsPerQuiz));
  if (
    !Number.isFinite(wordsPerQuiz) ||
    wordsPerQuiz < CROSSWORD_BANK_MIN_WORDS_PER_QUIZ ||
    wordsPerQuiz > CROSSWORD_BANK_MAX_WORDS_PER_QUIZ
  ) {
    fieldErrors.wordsPerQuiz = `Words per quiz must be between ${CROSSWORD_BANK_MIN_WORDS_PER_QUIZ} and ${CROSSWORD_BANK_MAX_WORDS_PER_QUIZ}`;
  }

  if (!entriesBank.length) {
    fieldErrors.entriesBank = "Add at least one word/clue pair";
  }

  if (entriesBank.length > CROSSWORD_BANK_MAX_ENTRIES) {
    fieldErrors.entriesBank = `Word bank can contain at most ${CROSSWORD_BANK_MAX_ENTRIES} entries`;
  }

  // User rule: bank size must be at least wordsPerQuiz.
  if (Number.isFinite(wordsPerQuiz) && entriesBank.length < wordsPerQuiz) {
    fieldErrors.entriesBank =
      "Word bank size must be at least the configured words-per-quiz";
  }

  const ttl = normalizeTotalTimeLimit(body?.totalTimeLimit);
  if (ttl !== null && (!Number.isFinite(ttl) || ttl < 5)) {
    fieldErrors.totalTimeLimit = "Total time must be at least 5 seconds";
  }

  const questionErrors = entriesBank.map((e) => {
    const errs: string[] = [];
    if (!e.answer.trim()) errs.push("Answer is required");
    if (!/^[A-Z]+$/.test(e.answer.trim().toUpperCase())) {
      errs.push("Answer must contain only letters A-Z (no spaces)");
    }
    if (!e.clue.trim()) errs.push("Clue is required");
    return errs.length ? errs : undefined;
  });

  return { fieldErrors, questionErrors };
}

function buildTypePatch(body: any, entriesBank: BankEntry[]) {
  const wordsPerQuiz = Math.floor(Number(body?.wordsPerQuiz ?? 5));
  return {
    totalTimeLimit: normalizeTotalTimeLimit(body?.totalTimeLimit),
    wordsPerQuiz: Math.min(
      CROSSWORD_BANK_MAX_WORDS_PER_QUIZ,
      Math.max(CROSSWORD_BANK_MIN_WORDS_PER_QUIZ, wordsPerQuiz),
    ),
    entriesBank: entriesBank
      .slice(0, CROSSWORD_BANK_MAX_ENTRIES)
      .map(normalizeBankEntry),
  };
}

function seedFromString(seedText: string): number {
  const h = crypto.createHash("sha256").update(seedText).digest("hex");
  const n = Number.parseInt(h.slice(0, 8), 16);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function createRng(seedText: string) {
  let state = seedFromString(seedText) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function randInt(min: number, max: number, rnd: () => number) {
  if (min >= max) return min;
  return Math.floor(rnd() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[], rnd: () => number) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(0, i, rnd);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function sampleEntries(entries: BankEntry[], take: number, rnd: () => number) {
  return shuffle(entries, rnd).slice(0, take);
}

function buildScheduleVariant(quizDoc: any, ctx: { scheduleId: string }) {
  const wordsPerQuiz = Math.max(
    CROSSWORD_BANK_MIN_WORDS_PER_QUIZ,
    Math.min(
      CROSSWORD_BANK_MAX_WORDS_PER_QUIZ,
      Number(quizDoc?.wordsPerQuiz ?? 5),
    ),
  );
  const bankRaw = Array.isArray(quizDoc?.entriesBank)
    ? quizDoc.entriesBank
    : [];
  const bank = bankRaw
    .map(normalizeBankEntry)
    .filter((e: BankEntry) => !!e.answer && !!e.clue);

  if (!bank.length) return { entries: [], grid: undefined };

  const rnd = createRng(
    `${String(quizDoc?.rootQuizId ?? "")}:${Number(quizDoc?.version ?? 1)}:${ctx.scheduleId}`,
  );
  const take = Math.min(wordsPerQuiz, bank.length);

  let best: {
    entries: Array<{
      id: string;
      answer: string;
      clue: string;
      direction: "across" | "down" | null;
      positions: { row: number; col: number }[];
    }>;
    grid: any[][];
    score: number;
  } | null = null;

  const attempts = Math.max(8, Math.min(40, bank.length * 2));
  for (let i = 0; i < attempts; i++) {
    const chosen = sampleEntries(bank, take, rnd);
    const words: InputWord[] = chosen.map((e) => ({
      id: e.id,
      answer: e.answer.trim().toUpperCase(),
      clue: e.clue.trim(),
    }));

    const generated = generateCrossword(words, 20, {
      allowIslandFallback: true,
    });
    const packed = packTopLeftAndCrop(generated.grid, generated.entries);

    const byId = new Map(chosen.map((e) => [String(e.id), e]));
    const entries = packed.entries.map((e) => {
      const src = byId.get(String(e.id));
      return {
        id: String(e.id),
        answer: String(src?.answer ?? e.answer ?? "").toUpperCase(),
        clue: String(src?.clue ?? e.clue ?? ""),
        direction: e.direction ?? null,
        positions: Array.isArray(e.positions) ? e.positions : [],
      };
    });

    const score = entries.length;
    if (!best || score > best.score) {
      best = {
        entries,
        grid: packed.grid,
        score,
      };
    }
    if (entries.length >= take) break;
  }

  return {
    entries: best?.entries ?? [],
    grid: best?.grid ?? undefined,
  };
}

function buildAttemptSpecCrosswordBank(quizDoc: any): AttemptSpecEnvelope {
  const entries = Array.isArray(quizDoc?.entries) ? quizDoc.entries : [];
  const renderCrossword: RenderItem = {
    kind: "crossword",
    id: "crossword",
    grid: quizDoc.grid ?? undefined,
    entries: entries.map((e: any) => ({
      id: String(e.id),
      clue: String(e.clue ?? ""),
      positions: Array.isArray(e.positions) ? e.positions : [],
      direction: e.direction ?? null,
    })),
  };

  const gradingItems = entries.map((e: any) => ({
    kind: "crossword" as const,
    id: String(e.id),
    answer: String(e.answer ?? ""),
    maxScore: 1,
  }));

  return {
    quizId: String(quizDoc._id),
    quizRootId: String(quizDoc.rootQuizId),
    quizVersion: Number(quizDoc.version),
    quizType: quizDoc.quizType as QuizTypeKey,
    contentHash: contentHash({
      totalTimeLimit: normalizeTotalTimeLimit(quizDoc.totalTimeLimit),
      wordsPerQuiz: Number(quizDoc.wordsPerQuiz ?? 0),
      entries,
      grid: quizDoc.grid,
    }),
    renderSpec: {
      totalTimeLimit: normalizeTotalTimeLimit(quizDoc.totalTimeLimit),
      items: [renderCrossword],
    },
    gradingKey: { items: gradingItems },
  };
}

function gradeAttemptCrosswordBank(
  spec: AttemptSpecEnvelope,
  answers: Answer[],
): AutoscoreResult {
  const map: Record<string, string> = (() => {
    if (
      answers.length === 1 &&
      answers[0] &&
      typeof answers[0].value === "object" &&
      !Array.isArray(answers[0].value)
    ) {
      return answers[0].value as Record<string, string>;
    }
    const out: Record<string, string> = {};
    for (const a of answers) {
      const key = (a.id ?? a.itemId) as string;
      out[key] = String(a.value ?? "");
    }
    return out;
  })();

  const itemScores: ItemScore[] = [];
  let total = 0;
  let max = 0;

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

function aggregateScheduledCrosswordBank({
  quizDoc,
  attempts,
  topCrosswordAnswerMinPct = 0.05,
}: ScheduleBreakdownInput) {
  const entries = Array.isArray(quizDoc?.entries) ? quizDoc.entries : [];
  const entryById = new Map<string, any>(
    entries.map((e: any) => [String(e.id), e]),
  );

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

  const qScoreSum = new Map<string, number>();
  const qMaxSum = new Map<string, number>();
  const correctCount = new Map<string, number>();
  const attemptsPerEntry = new Map<string, number>();
  const answerCounts = new Map<string, Map<string, number>>();

  const accAnswer = (entryId: string, raw: unknown) => {
    if (!entryById.has(entryId)) return;
    const value = normalizeFreeText(String(raw ?? ""));
    if (!answerCounts.has(entryId)) answerCounts.set(entryId, new Map());
    const m = answerCounts.get(entryId)!;
    m.set(value, (m.get(value) || 0) + 1);
  };

  for (const a of attempts) {
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

        if (mx > 0 && scr / mx >= 0.999) {
          correctCount.set(entryId, (correctCount.get(entryId) || 0) + 1);
        }
      }
    }

    const map =
      a?.answers && typeof a.answers === "object"
        ? (a.answers as any)["crossword"]
        : undefined;
    if (map && typeof map === "object") {
      for (const [entryId, raw] of Object.entries(map)) {
        accAnswer(String(entryId), raw);
      }
    }
  }

  const items = entries.map((e: any) => {
    const entryId = String(e.id);
    const totalAttempts = attemptsPerEntry.get(entryId) || 0;
    const qSum = qScoreSum.get(entryId) || 0;
    const qMax = qMaxSum.get(entryId) || 0;
    const perQuestionAvg = qMax > 0 ? qSum / qMax : null;
    const correctPct = toPct01(correctCount.get(entryId) || 0, totalAttempts);

    let answers:
      | { value: string; count: number; pct: number; pctPct: number }[]
      | undefined;

    const ac = answerCounts.get(entryId);
    if (ac) {
      const total = Array.from(ac.values()).reduce((s, c) => s + c, 0);
      if (total > 0) {
        answers = Array.from(ac.entries())
          .map(([value, count]) => {
            const p01 = toPct01(count, total);
            return { value, count, pct: p01, pctPct: p01 * 100 };
          })
          .filter((x) => x.pct >= topCrosswordAnswerMinPct)
          .sort((a, b) => b.pct - a.pct);
        if (!answers.length) answers = undefined;
      }
    }

    return {
      entryId,
      clue: String(e.clue ?? ""),
      expected: String(e.answer ?? ""),
      totalAttempts,
      perQuestionAvg,
      perQuestionAvgPct: pct100(perQuestionAvg),
      correctPct,
      correctPctPct: correctPct * 100,
      ...(answers ? { answers } : {}),
    };
  });

  return {
    kind: "crossword" as const,
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

// Currently not in use in AI-Service. Potential prompting difficulties - to explore later.
export const CROSSWORD_BANK_QUIZ_AI_METADATA = {
  description:
    "Randomized crossword generated per schedule from a configured word/clue bank",
  schema: {
    name: { type: "string", required: true },
    subject: { type: "string", required: true },
    topic: { type: "string", required: true },
    totalTimeLimit: { type: "number | null" },
    wordsPerQuiz: {
      type: "number",
      required: true,
      min: CROSSWORD_BANK_MIN_WORDS_PER_QUIZ,
      max: CROSSWORD_BANK_MAX_WORDS_PER_QUIZ,
    },
    entriesBank: {
      type: "array",
      required: true,
      schema: {
        id: { type: "string", required: true },
        answer: { type: "string", required: true },
        clue: { type: "string", required: true },
      },
    },
  },
  validation: {
    bankRule: "entriesBank.length must be >= wordsPerQuiz",
    minWordsPerQuiz: CROSSWORD_BANK_MIN_WORDS_PER_QUIZ,
    maxWordsPerQuiz: CROSSWORD_BANK_MAX_WORDS_PER_QUIZ,
    maxBankEntries: CROSSWORD_BANK_MAX_ENTRIES,
  },
  aiPromptingRules: {
    systemPrompt:
      "Create crossword word/clue banks suitable for randomized schedule generation.",
    formatInstructions:
      "Return entriesBank with uppercase single-word answers and clear clues.",
    examples: [],
  },
};

export function registerCrosswordBankQuiz() {
  registerQuizType({
    type: "crossword-bank",
    Model: CrosswordBankQuizModel,
    readItemsFromBody,
    coerceItems: (raw) => raw.map(normalizeBankEntry),
    validate: validateCrosswordBank,
    buildTypePatch,
    buildAttemptSpec: buildAttemptSpecCrosswordBank,
    gradeAttempt: gradeAttemptCrosswordBank,
    aggregateScheduledQuiz: aggregateScheduledCrosswordBank as any,
    buildScheduleVariant,
  });
}
