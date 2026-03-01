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
  contentHash,
} from "../quiz-shared";
import { scoreMC_StrictPartial } from "../../utils/scoring-helpers";
import { aggregateScheduledRapid } from "./quiz-rapid";

type ArithmeticOperator = "+" | "-" | "*" | "/";

type ArithmeticAddSubSettings = {
  operandMin: number;
  operandMax: number;
  answerMin: number;
  answerMax: number;
  allowNegative: boolean;
};

type ArithmeticMultiplicationSettings = {
  mode: "times-table" | "range";
  tables: number[];
  multiplierMin: number;
  multiplierMax: number;
  operandMin: number;
  operandMax: number;
  answerMin: number;
  answerMax: number;
};

type ArithmeticDivisionSettings = {
  divisorMin: number;
  divisorMax: number;
  quotientMin: number;
  quotientMax: number;
  answerMin: number;
  answerMax: number;
  allowNegative: boolean;
};

type ArithmeticOperationSettings = {
  addition: ArithmeticAddSubSettings;
  subtraction: ArithmeticAddSubSettings;
  multiplication: ArithmeticMultiplicationSettings;
  division: ArithmeticDivisionSettings;
};

type ArithmeticConfig = {
  questionCount: number;
  operators: ArithmeticOperator[];
  timePerQuestion: number;
  choicesPerQuestion: number;
  operationSettings: ArithmeticOperationSettings;
};

type ArithmeticGeneratedItem = {
  id: string;
  type: "mc";
  text: string;
  timeLimit: number;
  image: null;
  options: Array<{ id: string; text: string; correct: boolean }>;
};

const RAPID_ARITHMETIC_MIN_QUESTIONS = 1;
const RAPID_ARITHMETIC_MAX_QUESTIONS = 20;
const RAPID_ARITHMETIC_MIN_TIME_PER_QUESTION = 5;
const RAPID_ARITHMETIC_MAX_TIME_PER_QUESTION = 60;

const RAPID_ARITHMETIC_DEFAULT_TABLES = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
];
const RAPID_ARITHMETIC_MAX_TABLE = 20;

const ArithmeticSchema = new Schema(
  {
    questionCount: {
      type: Number,
      required: true,
      default: 10,
      min: RAPID_ARITHMETIC_MIN_QUESTIONS,
      max: RAPID_ARITHMETIC_MAX_QUESTIONS,
    },
    operators: {
      type: [String],
      default: ["+", "-", "*", "/"],
      enum: ["+", "-", "*", "/"],
    },
    timePerQuestion: {
      type: Number,
      required: true,
      default: 12,
      min: RAPID_ARITHMETIC_MIN_TIME_PER_QUESTION,
      max: RAPID_ARITHMETIC_MAX_TIME_PER_QUESTION,
    },
    choicesPerQuestion: {
      type: Number,
      required: true,
      default: 4,
      min: 2,
      max: 6,
    },
    operationSettings: {
      type: new Schema(
        {
          addition: {
            type: new Schema(
              {
                operandMin: { type: Number, default: 0 },
                operandMax: { type: Number, default: 20 },
                answerMin: { type: Number, default: 0 },
                answerMax: { type: Number, default: 40 },
                allowNegative: { type: Boolean, default: false },
              },
              { _id: false },
            ),
            default: undefined,
          },
          subtraction: {
            type: new Schema(
              {
                operandMin: { type: Number, default: 0 },
                operandMax: { type: Number, default: 20 },
                answerMin: { type: Number, default: 0 },
                answerMax: { type: Number, default: 20 },
                allowNegative: { type: Boolean, default: false },
              },
              { _id: false },
            ),
            default: undefined,
          },
          multiplication: {
            type: new Schema(
              {
                mode: {
                  type: String,
                  enum: ["times-table", "range"],
                  default: "times-table",
                },
                tables: {
                  type: [Number],
                  default: RAPID_ARITHMETIC_DEFAULT_TABLES,
                },
                multiplierMin: { type: Number, default: 2 },
                multiplierMax: { type: Number, default: 12 },
                operandMin: { type: Number, default: 0 },
                operandMax: { type: Number, default: 20 },
                answerMin: { type: Number, default: 0 },
                answerMax: { type: Number, default: 400 },
              },
              { _id: false },
            ),
            default: undefined,
          },
          division: {
            type: new Schema(
              {
                divisorMin: { type: Number, default: 2 },
                divisorMax: { type: Number, default: 12 },
                quotientMin: { type: Number, default: 0 },
                quotientMax: { type: Number, default: 20 },
                answerMin: { type: Number, default: 0 },
                answerMax: { type: Number, default: 20 },
                allowNegative: { type: Boolean, default: false },
              },
              { _id: false },
            ),
            default: undefined,
          },
        },
        { _id: false },
      ),
      default: undefined,
    },

    // Variant output persisted per schedule.
    items: {
      type: [
        new Schema(
          {
            id: { type: String, required: true },
            type: { type: String, enum: ["mc"], required: true },
            text: { type: String, default: "" },
            timeLimit: { type: Number, required: true },
            image: { type: ImageMetaSchema, default: null },
            options: { type: [MCOptionSchema], default: [] },
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
  },
  { _id: false },
);

export const RapidArithmeticQuizModel = QuizBaseModel.discriminator(
  "rapid-arithmetic",
  ArithmeticSchema,
);

function toNumber(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(v: unknown, fallback: boolean) {
  if (typeof v === "boolean") return v;
  if (v === "1" || v === 1 || String(v).toLowerCase() === "true") return true;
  if (v === "0" || v === 0 || String(v).toLowerCase() === "false")
    return false;
  return fallback;
}

function toInt(v: unknown, fallback: number) {
  return Math.trunc(toNumber(v, fallback));
}

function normalizeRange(minV: unknown, maxV: unknown, defMin: number, defMax: number) {
  const rawMin = toInt(minV, defMin);
  const rawMax = toInt(maxV, defMax);
  return { min: Math.min(rawMin, rawMax), max: Math.max(rawMin, rawMax) };
}

function toOperators(v: unknown): ArithmeticOperator[] {
  if (!Array.isArray(v)) return [];
  const out = v
    .map((x) => String(x))
    .filter(
      (x): x is ArithmeticOperator =>
        x === "+" || x === "-" || x === "*" || x === "/",
    );
  return Array.from(new Set(out));
}

function defaultOperationSettings(): ArithmeticOperationSettings {
  const add: ArithmeticAddSubSettings = {
    operandMin: 0,
    operandMax: 20,
    answerMin: 0,
    answerMax: 40,
    allowNegative: false,
  };

  const sub: ArithmeticAddSubSettings = {
    operandMin: 0,
    operandMax: 20,
    answerMin: 0,
    answerMax: 20,
    allowNegative: false,
  };

  const mul: ArithmeticMultiplicationSettings = {
    mode: "times-table",
    tables: RAPID_ARITHMETIC_DEFAULT_TABLES,
    multiplierMin: 2,
    multiplierMax: 12,
    operandMin: 0,
    operandMax: 20,
    answerMin: 0,
    answerMax: 400,
  };

  const div: ArithmeticDivisionSettings = {
    divisorMin: 2,
    divisorMax: 12,
    quotientMin: 0,
    quotientMax: 20,
    answerMin: 0,
    answerMax: 20,
    allowNegative: false,
  };

  return {
    addition: add,
    subtraction: sub,
    multiplication: mul,
    division: div,
  };
}

function normalizeOperationSettings(
  raw: any,
): ArithmeticOperationSettings {
  const defaults = defaultOperationSettings();

  const addRaw = raw?.addition ?? {};
  const addOperand = normalizeRange(
    addRaw?.operandMin,
    addRaw?.operandMax,
    defaults.addition.operandMin,
    defaults.addition.operandMax,
  );
  const addAnswer = normalizeRange(
    addRaw?.answerMin,
    addRaw?.answerMax,
    defaults.addition.answerMin,
    defaults.addition.answerMax,
  );
  const addAllowNegative = toBool(
    addRaw?.allowNegative,
    defaults.addition.allowNegative,
  );
  const addition: ArithmeticAddSubSettings = {
    operandMin: addAllowNegative ? addOperand.min : Math.max(0, addOperand.min),
    operandMax: Math.max(addOperand.max, addAllowNegative ? addOperand.min : Math.max(0, addOperand.min)),
    answerMin: addAllowNegative ? addAnswer.min : Math.max(0, addAnswer.min),
    answerMax: Math.max(addAnswer.max, addAllowNegative ? addAnswer.min : Math.max(0, addAnswer.min)),
    allowNegative: addAllowNegative,
  };

  const subRaw = raw?.subtraction ?? {};
  const subOperand = normalizeRange(
    subRaw?.operandMin,
    subRaw?.operandMax,
    defaults.subtraction.operandMin,
    defaults.subtraction.operandMax,
  );
  const subAnswer = normalizeRange(
    subRaw?.answerMin,
    subRaw?.answerMax,
    defaults.subtraction.answerMin,
    defaults.subtraction.answerMax,
  );
  const subAllowNegative = toBool(
    subRaw?.allowNegative,
    defaults.subtraction.allowNegative,
  );
  const subtraction: ArithmeticAddSubSettings = {
    operandMin: subAllowNegative ? subOperand.min : Math.max(0, subOperand.min),
    operandMax: Math.max(subOperand.max, subAllowNegative ? subOperand.min : Math.max(0, subOperand.min)),
    answerMin: subAllowNegative ? subAnswer.min : Math.max(0, subAnswer.min),
    answerMax: Math.max(subAnswer.max, subAllowNegative ? subAnswer.min : Math.max(0, subAnswer.min)),
    allowNegative: subAllowNegative,
  };

  const mulRaw = raw?.multiplication ?? {};
  const mulMode =
    mulRaw?.mode === "range" ? ("range" as const) : ("times-table" as const);
  const mulTables: number[] = Array.from(
    new Set<number>(
      (
        Array.isArray(mulRaw?.tables)
          ? mulRaw.tables
          : defaults.multiplication.tables
      )
        .map((x: unknown) => toInt(x, NaN))
        .filter(
          (n: number): n is number =>
            Number.isFinite(n) && n >= 2 && n <= RAPID_ARITHMETIC_MAX_TABLE,
        ),
    ),
  );
  const mulMultiplier = normalizeRange(
    mulRaw?.multiplierMin,
    mulRaw?.multiplierMax,
    defaults.multiplication.multiplierMin,
    defaults.multiplication.multiplierMax,
  );
  const mulOperand = normalizeRange(
    mulRaw?.operandMin,
    mulRaw?.operandMax,
    defaults.multiplication.operandMin,
    defaults.multiplication.operandMax,
  );
  const mulAnswer = normalizeRange(
    mulRaw?.answerMin,
    mulRaw?.answerMax,
    defaults.multiplication.answerMin,
    defaults.multiplication.answerMax,
  );
  const multiplication: ArithmeticMultiplicationSettings = {
    mode: mulMode,
    tables: mulTables.length ? mulTables : RAPID_ARITHMETIC_DEFAULT_TABLES,
    multiplierMin: Math.max(0, mulMultiplier.min),
    multiplierMax: Math.max(0, mulMultiplier.max),
    operandMin: Math.max(0, mulOperand.min),
    operandMax: Math.max(0, mulOperand.max),
    answerMin: Math.max(0, mulAnswer.min),
    answerMax: Math.max(Math.max(0, mulAnswer.min), mulAnswer.max),
  };

  const divRaw = raw?.division ?? {};
  const divAllowNegative = toBool(
    divRaw?.allowNegative,
    defaults.division.allowNegative,
  );
  const divDivisor = normalizeRange(
    divRaw?.divisorMin,
    divRaw?.divisorMax,
    defaults.division.divisorMin,
    defaults.division.divisorMax,
  );
  const divQuotient = normalizeRange(
    divRaw?.quotientMin,
    divRaw?.quotientMax,
    defaults.division.quotientMin,
    defaults.division.quotientMax,
  );
  const divAnswer = normalizeRange(
    divRaw?.answerMin,
    divRaw?.answerMax,
    defaults.division.answerMin,
    defaults.division.answerMax,
  );
  const division: ArithmeticDivisionSettings = {
    divisorMin: Math.max(2, divDivisor.min),
    divisorMax: Math.max(2, divDivisor.max),
    quotientMin: divAllowNegative ? divQuotient.min : Math.max(0, divQuotient.min),
    quotientMax: Math.max(
      divAllowNegative ? divQuotient.min : Math.max(0, divQuotient.min),
      divQuotient.max,
    ),
    answerMin: divAllowNegative ? divAnswer.min : Math.max(0, divAnswer.min),
    answerMax: Math.max(
      divAllowNegative ? divAnswer.min : Math.max(0, divAnswer.min),
      divAnswer.max,
    ),
    allowNegative: divAllowNegative,
  };

  return { addition, subtraction, multiplication, division };
}

function normalizeConfig(raw: any): ArithmeticConfig {
  const questionCount = Math.max(
    RAPID_ARITHMETIC_MIN_QUESTIONS,
    Math.floor(toNumber(raw?.questionCount, 10)),
  );
  const operators = toOperators(raw?.operators);
  const timePerQuestion = Math.max(
    RAPID_ARITHMETIC_MIN_TIME_PER_QUESTION,
    Math.floor(toNumber(raw?.timePerQuestion, 12)),
  );
  const choicesPerQuestion = Math.max(
    2,
    Math.floor(toNumber(raw?.choicesPerQuestion, 4)),
  );
  const operationSettings = normalizeOperationSettings(
    raw?.operationSettings,
  );
  return {
    questionCount,
    operators: operators.length ? operators : ["+", "-", "*", "/"],
    timePerQuestion,
    choicesPerQuestion,
    operationSettings,
  };
}

function sanitizeConfig(cfg: ArithmeticConfig): ArithmeticConfig {
  const operationSettings = normalizeOperationSettings(
    cfg.operationSettings,
  );
  return {
    ...cfg,
    questionCount: Math.min(
      RAPID_ARITHMETIC_MAX_QUESTIONS,
      Math.max(RAPID_ARITHMETIC_MIN_QUESTIONS, cfg.questionCount),
    ),
    timePerQuestion: Math.min(
      RAPID_ARITHMETIC_MAX_TIME_PER_QUESTION,
      Math.max(RAPID_ARITHMETIC_MIN_TIME_PER_QUESTION, cfg.timePerQuestion),
    ),
    choicesPerQuestion: Math.min(6, Math.max(2, cfg.choicesPerQuestion)),
    operationSettings,
  };
}

function readItemsFromBody(body: any) {
  const operatorsSrc = body?.operatorsJson ?? body?.operators;
  const operationSettingsSrc =
    body?.operationSettingsJson ?? body?.operationSettings;
  let operators: unknown = operatorsSrc;
  let operationSettings: unknown = operationSettingsSrc;
  if (typeof operatorsSrc === "string") {
    try {
      operators = JSON.parse(operatorsSrc);
    } catch {
      operators = String(operatorsSrc)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
  }
  if (typeof operationSettingsSrc === "string") {
    try {
      operationSettings = JSON.parse(operationSettingsSrc);
    } catch {
      operationSettings = undefined;
    }
  }

  return [
    normalizeConfig({
      questionCount: body?.questionCount,
      operators,
      timePerQuestion: body?.timePerQuestion,
      choicesPerQuestion: body?.choicesPerQuestion,
      operationSettings,
    }),
  ];
}

function validateRapidArithmetic(body: any, items: any[]) {
  const fieldErrors: Record<string, string | string[] | undefined> = {};
  if (!body?.name?.trim()) fieldErrors.name = "Name is required";
  if (!body?.subject?.trim()) fieldErrors.subject = "Subject is required";
  if (!body?.topic?.trim()) fieldErrors.topic = "Topic is required";

  const cfg = normalizeConfig(items?.[0] ?? {});

  if (
    cfg.questionCount < RAPID_ARITHMETIC_MIN_QUESTIONS ||
    cfg.questionCount > RAPID_ARITHMETIC_MAX_QUESTIONS
  ) {
    fieldErrors.questionCount = `Question count must be between ${RAPID_ARITHMETIC_MIN_QUESTIONS} and ${RAPID_ARITHMETIC_MAX_QUESTIONS}`;
  }
  if (!cfg.operators.length) {
    fieldErrors.operators = "Select at least one operation";
  }
  if (
    cfg.timePerQuestion < RAPID_ARITHMETIC_MIN_TIME_PER_QUESTION ||
    cfg.timePerQuestion > RAPID_ARITHMETIC_MAX_TIME_PER_QUESTION
  ) {
    fieldErrors.timePerQuestion = `Time per question must be between ${RAPID_ARITHMETIC_MIN_TIME_PER_QUESTION} and ${RAPID_ARITHMETIC_MAX_TIME_PER_QUESTION} seconds`;
  }
  if (cfg.choicesPerQuestion < 2 || cfg.choicesPerQuestion > 6) {
    fieldErrors.choicesPerQuestion =
      "Choices per question must be between 2 and 6";
  }
  if (
    cfg.operationSettings.multiplication.mode === "times-table" &&
    !cfg.operationSettings.multiplication.tables.length
  ) {
    fieldErrors.operationSettings =
      "Multiplication times-table mode needs at least one table.";
  }

  return { fieldErrors, questionErrors: [] as Array<string[] | undefined> };
}

function buildTypePatch(_body: any, items: any[]) {
  const cfg = sanitizeConfig(normalizeConfig(items?.[0] ?? {}));
  return {
    questionCount: cfg.questionCount,
    operators: cfg.operators,
    timePerQuestion: cfg.timePerQuestion,
    choicesPerQuestion: cfg.choicesPerQuestion,
    operationSettings: cfg.operationSettings,
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
  const value = Math.floor(rnd() * (max - min + 1)) + min;
  return value;
}

function pickNumberInRange(
  min: number,
  max: number,
  rnd: () => number,
  opts?: { excludeOne?: boolean; excludeZero?: boolean },
) {
  const excludeOne = Boolean(opts?.excludeOne);
  const excludeZero = Boolean(opts?.excludeZero);
  const candidates: number[] = [];

  for (let n = min; n <= max; n++) {
    if (excludeOne && n === 1) continue;
    if (excludeZero && n === 0) continue;
    candidates.push(n);
  }

  if (candidates.length > 0) {
    return choose(candidates, rnd);
  }

  // Fallbacks keep generation alive even for edge-case ranges like [1,1].
  if (excludeOne && excludeZero) return 2;
  if (excludeOne) return 0;
  if (excludeZero) return 1;
  return min;
}

function choose<T>(arr: T[], rnd: () => number): T {
  return arr[randInt(0, arr.length - 1, rnd)] as T;
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(0, i, rnd);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function symbolOf(op: ArithmeticOperator) {
  if (op === "*") return "×";
  if (op === "/") return "÷";
  return op;
}

function inRange(value: number, min: number, max: number) {
  return value >= min && value <= max;
}

function buildAdditionQuestion(cfg: ArithmeticConfig, rnd: () => number) {
  const s = cfg.operationSettings.addition;
  for (let attempt = 0; attempt < 120; attempt++) {
    const a = pickNumberInRange(s.operandMin, s.operandMax, rnd, {
      excludeOne: true,
    });
    const b = pickNumberInRange(s.operandMin, s.operandMax, rnd, {
      excludeOne: true,
    });
    const result = a + b;

    if (!inRange(result, s.answerMin, s.answerMax)) continue;
    if (!s.allowNegative && (a < 0 || b < 0 || result < 0)) continue;

    return { op: "+" as const, a, b, result };
  }
  return null;
}

function buildSubtractionQuestion(cfg: ArithmeticConfig, rnd: () => number) {
  const s = cfg.operationSettings.subtraction;
  for (let attempt = 0; attempt < 120; attempt++) {
    let a = pickNumberInRange(s.operandMin, s.operandMax, rnd, {
      excludeOne: true,
    });
    let b = pickNumberInRange(s.operandMin, s.operandMax, rnd, {
      excludeOne: true,
    });

    if (!s.allowNegative && a < b) {
      [a, b] = [b, a];
    }

    const result = a - b;
    if (!inRange(result, s.answerMin, s.answerMax)) continue;
    if (!s.allowNegative && (a < 0 || b < 0 || result < 0)) continue;

    return { op: "-" as const, a, b, result };
  }
  return null;
}

function buildMultiplicationQuestion(cfg: ArithmeticConfig, rnd: () => number) {
  const s = cfg.operationSettings.multiplication;
  for (let attempt = 0; attempt < 120; attempt++) {
    let a = 0;
    let b = 0;

    if (s.mode === "times-table") {
      const tables = s.tables.filter((n) => n !== 1);
      if (!tables.length) return null;
      a = choose(tables, rnd);
      b = pickNumberInRange(s.multiplierMin, s.multiplierMax, rnd, {
        excludeOne: true,
      });
    } else {
      a = pickNumberInRange(s.operandMin, s.operandMax, rnd, {
        excludeOne: true,
      });
      b = pickNumberInRange(s.operandMin, s.operandMax, rnd, {
        excludeOne: true,
      });
    }

    const result = a * b;
    if (!inRange(result, s.answerMin, s.answerMax)) continue;
    return { op: "*" as const, a, b, result };
  }
  return null;
}

function buildDivisionQuestion(cfg: ArithmeticConfig, rnd: () => number) {
  const s = cfg.operationSettings.division;
  for (let attempt = 0; attempt < 160; attempt++) {
    const divisor = pickNumberInRange(s.divisorMin, s.divisorMax, rnd, {
      excludeOne: true,
      excludeZero: true,
    });
    let quotient = pickNumberInRange(s.quotientMin, s.quotientMax, rnd);

    if (!s.allowNegative && quotient < 0) {
      quotient = Math.abs(quotient);
    } else if (
      s.allowNegative &&
      quotient > 0 &&
      rnd() < 0.4 &&
      inRange(-quotient, s.quotientMin, s.quotientMax)
    ) {
      quotient = -quotient;
    }

    if (!inRange(quotient, s.answerMin, s.answerMax)) continue;
    if (!s.allowNegative && quotient < 0) continue;

    const dividend = divisor * quotient;
    if (dividend === 1 || divisor === 1) continue;

    return { op: "/" as const, a: dividend, b: divisor, result: quotient };
  }
  return null;
}

function buildQuestionForOperator(
  op: ArithmeticOperator,
  cfg: ArithmeticConfig,
  rnd: () => number,
) {
  if (op === "+") return buildAdditionQuestion(cfg, rnd);
  if (op === "-") return buildSubtractionQuestion(cfg, rnd);
  if (op === "*") return buildMultiplicationQuestion(cfg, rnd);
  return buildDivisionQuestion(cfg, rnd);
}

function buildQuestion(cfg: ArithmeticConfig, rnd: () => number) {
  const ops = shuffle(cfg.operators, rnd);
  for (const op of ops) {
    const question = buildQuestionForOperator(op, cfg, rnd);
    if (question) return question;
  }

  // Safe fallback in case settings are too restrictive.
  return { op: "+" as const, a: 2, b: 2, result: 4 };
}

function buildOptions(
  correct: number,
  choicesPerQuestion: number,
  rnd: () => number,
) {
  const values = new Set<number>([correct]);
  const spread = Math.max(3, Math.floor(Math.abs(correct) * 0.35) + 2);

  let guard = 0;
  while (values.size < choicesPerQuestion && guard < 200) {
    const delta = randInt(1, spread, rnd);
    const sign = rnd() < 0.5 ? -1 : 1;
    values.add(correct + delta * sign);
    guard += 1;
  }

  while (values.size < choicesPerQuestion) {
    values.add(correct + values.size);
  }

  return shuffle(Array.from(values), rnd).map((value) => ({
    id: crypto.randomUUID(),
    text: String(value),
    correct: value === correct,
  }));
}

function generateItems(
  cfg: ArithmeticConfig,
  seedText: string,
): ArithmeticGeneratedItem[] {
  const rnd = createRng(seedText);
  const out: ArithmeticGeneratedItem[] = [];

  for (let i = 0; i < cfg.questionCount; i++) {
    const q = buildQuestion(cfg, rnd);
    const options = buildOptions(q.result, cfg.choicesPerQuestion, rnd);

    out.push({
      id: crypto.randomUUID(),
      type: "mc",
      text: `${q.a} ${symbolOf(q.op)} ${q.b} = ?`,
      timeLimit: cfg.timePerQuestion,
      image: null,
      options,
    });
  }

  return out;
}

function buildAttemptSpecRapidArithmetic(quizDoc: any): AttemptSpecEnvelope {
  const cfg = sanitizeConfig(normalizeConfig(quizDoc ?? {}));
  const items: ArithmeticGeneratedItem[] =
    Array.isArray(quizDoc?.items) && quizDoc.items.length
      ? quizDoc.items
      : generateItems(cfg, String(quizDoc?._id ?? "rapid-arithmetic"));

  const renderItems: AttemptSpecEnvelope["renderSpec"]["items"] = [];
  const gradingItems: AttemptSpecEnvelope["gradingKey"]["items"] = [];

  for (const it of items) {
    renderItems.push({
      kind: "mc",
      id: it.id,
      text: it.text,
      timeLimit: Number(it.timeLimit),
      image: null,
      options: (it.options ?? []).map((o: any) => ({
        id: o.id,
        text: String(o.text ?? ""),
      })),
    });

    gradingItems.push({
      kind: "mc",
      id: it.id,
      correctOptionIds: (it.options ?? [])
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
    contentHash: contentHash({
      questionCount: cfg.questionCount,
      operators: cfg.operators,
      timePerQuestion: cfg.timePerQuestion,
      choicesPerQuestion: cfg.choicesPerQuestion,
      operationSettings: cfg.operationSettings,
      items,
    }),
    renderSpec: { items: renderItems },
    gradingKey: { items: gradingItems },
  };
}

function gradeAttemptRapidArithmetic(
  spec: AttemptSpecEnvelope,
  answers: Answer[],
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

function buildScheduleVariant(quizDoc: any, ctx: { scheduleId: string }) {
  const cfg = sanitizeConfig(normalizeConfig(quizDoc ?? {}));
  const items = generateItems(
    cfg,
    `${String(quizDoc?.rootQuizId ?? "")}:${Number(quizDoc?.version ?? 1)}:${ctx.scheduleId}`,
  );
  return { items };
}

// Not in use. AI-generation dosen't provide much value for this quiz type.
export const RAPID_ARITHMETIC_QUIZ_AI_METADATA = {
  description:
    "Randomized rapid arithmetic quiz (MC-only) generated per schedule from configured ranges/operators",
  schema: {
    name: { type: "string", required: true },
    subject: { type: "string", required: true },
    topic: { type: "string", required: true },
    questionCount: {
      type: "number",
      required: true,
      min: RAPID_ARITHMETIC_MIN_QUESTIONS,
      max: RAPID_ARITHMETIC_MAX_QUESTIONS,
    },
    operators: {
      type: "array",
      required: true,
      items: ["+", "-", "*", "/"],
      minItems: 1,
    },
    timePerQuestion: {
      type: "number",
      required: true,
      min: RAPID_ARITHMETIC_MIN_TIME_PER_QUESTION,
      max: RAPID_ARITHMETIC_MAX_TIME_PER_QUESTION,
    },
    choicesPerQuestion: { type: "number", required: true, min: 2, max: 6 },
  },
  validation: {
    division:
      "Integer-only division; generated questions avoid fractional results",
    answerMode: "MC only",
  },
  aiPromptingRules: {
    systemPrompt:
      "Create randomized arithmetic quiz configurations, not fixed questions.",
    formatInstructions:
      "Return a JSON config with questionCount, operators, timePerQuestion, choicesPerQuestion, and operationSettings.",
    examples: [],
  },
};

export function registerRapidArithmeticQuiz() {
  registerQuizType({
    type: "rapid-arithmetic",
    Model: RapidArithmeticQuizModel,
    readItemsFromBody,
    coerceItems: (raw) => [normalizeConfig(raw?.[0] ?? {})],
    validate: validateRapidArithmetic,
    buildTypePatch,
    buildAttemptSpec: buildAttemptSpecRapidArithmetic,
    gradeAttempt: gradeAttemptRapidArithmetic,
    aggregateScheduledQuiz: aggregateScheduledRapid as any,
    buildScheduleVariant,
  });
}
