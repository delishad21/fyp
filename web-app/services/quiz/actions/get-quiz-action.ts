"use server";

import {
  BasicInitial,
  Cell,
  CrosswordBankInitial,
  CrosswordInitial,
  CrosswordPlacedEntry,
  QuizType,
  RapidArithmeticOperationSettings,
  RapidArithmeticMultiplicationSettings,
  RapidArithmeticInitial,
  RapidInitial,
  TrueFalseInitial,
} from "@/services/quiz/types/quizTypes";
import { getAuthHeader } from "@/services/user/session-definitions";
import { quizSvcUrl } from "@/utils/utils";

type QuizInitial =
  | BasicInitial
  | RapidInitial
  | CrosswordInitial
  | TrueFalseInitial
  | RapidArithmeticInitial
  | CrosswordBankInitial;

export type GetQuizResult =
  | {
      ok: true;
      data: QuizInitial;
      versions: number[];
      currentVersion: number;
    }
  | { ok: false; message: string; status?: number };

/** ---------------- Normalizers ---------------- */

function pickImageMeta(img: any | null | undefined) {
  if (!img) return undefined;
  return {
    url: img.url,
    filename: img.originalName ?? img.filename ?? img.name,
    mimetype: img.mimetype,
    size: img.size,
  };
}

function normalizeNullableSeconds(v: unknown): number | null {
  if (v == null) return null; // null/undefined -> null
  if (typeof v === "string" && v.trim() === "") return null; // "" -> null
  const n = Number(v);
  return Number.isFinite(n) ? n : null; // invalid -> null
}

function normalizeBasic(doc: any): BasicInitial {
  const items = Array.isArray(doc.items) ? doc.items : [];
  const normItems = items
    .map((it: any) => {
      const id = String(it?.id ?? crypto.randomUUID());
      const type = it?.type;

      if (type === "mc") {
        return {
          id,
          type: "mc" as const,
          text: String(it?.text ?? ""),
          image: pickImageMeta(it?.image),
          options: Array.isArray(it?.options)
            ? it.options.map((o: any) => ({
                id: String(o?.id ?? crypto.randomUUID()),
                text: String(o?.text ?? ""),
                correct: !!o?.correct,
              }))
            : [],
          timeLimit: normalizeNullableSeconds(it?.timeLimit ?? null),
        };
      }

      if (type === "open") {
        return {
          id,
          type: "open" as const,
          text: String(it?.text ?? ""),
          image: pickImageMeta(it?.image),
          answers: Array.isArray(it?.answers)
            ? it.answers.map((a: any) => ({
                id: String(a?.id ?? crypto.randomUUID()),
                text: String(a?.text ?? ""),
                caseSensitive: !!a?.caseSensitive,
              }))
            : [],
          timeLimit: normalizeNullableSeconds(it?.timeLimit ?? null),
        };
      }

      if (type === "context") {
        return {
          id,
          type: "context" as const,
          text: String(it?.text ?? ""),
          image: pickImageMeta(it?.image),
        };
      }
      return null;
    })
    .filter(Boolean) as BasicInitial["items"];

  return {
    id: String(doc.rootQuizId ?? doc._id), // rootQuizId
    version: Number(doc.version ?? 1),
    name: String(doc.name ?? ""),
    subject: String(doc.subject ?? ""),
    subjectColorHex: String(doc.subjectColorHex ?? ""),
    topic: String(doc.topic ?? ""),
    quizType: "basic",
    typeColorHex: doc.typeColorHex ? String(doc.typeColorHex) : "",
    totalTimeLimit: normalizeNullableSeconds(doc?.totalTimeLimit),
    items: normItems,
  };
}

function normalizeRapid(doc: any): RapidInitial {
  const items = Array.isArray(doc.items) ? doc.items : [];
  const normItems = items.map((it: any) => {
    const base = {
      id: String(it?.id ?? crypto.randomUUID()),
      text: String(it?.text ?? ""),
      timeLimit: normalizeNullableSeconds(it?.timeLimit),
      image: pickImageMeta(it?.image),
    };

    let options: { id: string; text: string; correct: boolean }[] =
      Array.isArray(it?.options)
        ? it.options.map((o: any) => ({
            id: String(o?.id ?? crypto.randomUUID()),
            text: String(o?.text ?? ""),
            correct: !!o?.correct,
          }))
        : [];

    if (options.length < 4) {
      const needed = 4 - options.length;
      for (let i = 0; i < needed; i++) {
        options.push({ id: crypto.randomUUID(), text: "", correct: false });
      }
    } else if (options.length > 4) {
      options = options.slice(0, 4);
    }

    const firstCorrect = options.findIndex((o) => o.correct);
    if (firstCorrect < 0) options[0].correct = true;
    if (firstCorrect > 0) {
      options = options.map((o, i) => ({ ...o, correct: i === firstCorrect }));
    }

    return { ...base, options };
  });

  return {
    id: String(doc.rootQuizId ?? doc._id),
    version: Number(doc.version ?? 1),
    name: String(doc.name ?? ""),
    subject: String(doc.subject ?? ""),
    subjectColorHex: String(doc.subjectColorHex ?? ""),
    topic: String(doc.topic ?? ""),
    quizType: "rapid",
    typeColorHex: doc.typeColorHex ? String(doc.typeColorHex) : "",
    items: normItems,
  };
}

function normalizeTrueFalse(doc: any): TrueFalseInitial {
  const items = Array.isArray(doc.items) ? doc.items : [];
  const normItems = items.map((it: any) => {
    const id = String(it?.id ?? crypto.randomUUID());

    const optionsSrc = Array.isArray(it?.options) ? it.options : [];
    const trueOpt = optionsSrc.find(
      (o: any) => String(o?.text ?? "").trim().toLowerCase() === "true"
    );
    const falseOpt = optionsSrc.find(
      (o: any) => String(o?.text ?? "").trim().toLowerCase() === "false"
    );
    const trueCorrect = !!trueOpt?.correct;
    const falseCorrect = !trueCorrect;

    return {
      id,
      type: "mc" as const,
      text: String(it?.text ?? ""),
      timeLimit: normalizeNullableSeconds(it?.timeLimit),
      image: pickImageMeta(it?.image),
      options: [
        { id: `${id}:true`, text: "True", correct: trueCorrect },
        { id: `${id}:false`, text: "False", correct: falseCorrect },
      ],
    };
  });

  return {
    id: String(doc.rootQuizId ?? doc._id),
    version: Number(doc.version ?? 1),
    name: String(doc.name ?? ""),
    subject: String(doc.subject ?? ""),
    subjectColorHex: String(doc.subjectColorHex ?? ""),
    topic: String(doc.topic ?? ""),
    quizType: "true-false",
    typeColorHex: doc.typeColorHex ? String(doc.typeColorHex) : "",
    items: normItems,
  };
}

function normalizeCrossword(doc: any): CrosswordInitial {
  const entries = Array.isArray(doc.entries) ? doc.entries : [];

  const normEntries = entries.map((e: any) => ({
    id: String(e?.id ?? crypto.randomUUID()),
    answer: String(e?.answer ?? ""),
    clue: String(e?.clue ?? ""),
  }));

  const placedEntries = entries
    .map((e: any) => {
      const dir = e?.direction;
      const pos = Array.isArray(e?.positions) ? e.positions : [];
      if (
        (dir === "across" || dir === "down" || dir === null) &&
        Array.isArray(pos) &&
        pos.length > 0
      ) {
        return {
          id: String(e?.id ?? crypto.randomUUID()),
          answer: String(e?.answer ?? ""),
          clue: String(e?.clue ?? ""),
          direction: dir as "across" | "down" | null,
          positions: pos.map((p: any) => ({
            row: Number(p?.row ?? 0),
            col: Number(p?.col ?? 0),
          })),
        };
      }
      return null;
    })
    .filter(Boolean) as CrosswordInitial["placedEntries"];

  const grid = Array.isArray(doc?.grid)
    ? (doc.grid as CrosswordInitial["grid"])
    : undefined;

  return {
    id: String(doc.rootQuizId ?? doc._id),
    version: Number(doc.version ?? 1),
    name: String(doc.name ?? ""),
    subject: String(doc.subject ?? ""),
    subjectColorHex: String(doc.subjectColorHex ?? ""),
    topic: String(doc.topic ?? ""),
    quizType: "crossword",
    typeColorHex: String(doc.typeColorHex ?? ""),
    totalTimeLimit: normalizeNullableSeconds(doc?.totalTimeLimit),
    entries: normEntries,
    placedEntries:
      placedEntries && placedEntries.length ? placedEntries : undefined,
    grid,
  };
}

function clampInt(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.trunc(fallback);
  return Math.trunc(n);
}

function clampRange(min: number, max: number) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return { min: lo, max: hi };
}

function normalizeRapidArithmeticSettings(doc: any): RapidArithmeticOperationSettings {
  const raw = doc?.operationSettings ?? {};

  const addRaw = raw?.addition ?? {};
  const addOperand = clampRange(
    clampInt(addRaw?.operandMin, 0),
    clampInt(addRaw?.operandMax, 20),
  );
  const addAnswer = clampRange(
    clampInt(addRaw?.answerMin, addOperand.min + addOperand.min),
    clampInt(addRaw?.answerMax, addOperand.max + addOperand.max),
  );
  const addition = {
    operandMin: addOperand.min,
    operandMax: addOperand.max,
    answerMin: addAnswer.min,
    answerMax: addAnswer.max,
    allowNegative: Boolean(addRaw?.allowNegative ?? false),
  };

  const subRaw = raw?.subtraction ?? {};
  const subOperand = clampRange(
    clampInt(subRaw?.operandMin, 0),
    clampInt(subRaw?.operandMax, 20),
  );
  const subAnswer = clampRange(
    clampInt(subRaw?.answerMin, 0),
    clampInt(subRaw?.answerMax, subOperand.max - subOperand.min),
  );
  const subtraction = {
    operandMin: subOperand.min,
    operandMax: subOperand.max,
    answerMin: subAnswer.min,
    answerMax: subAnswer.max,
    allowNegative: Boolean(subRaw?.allowNegative ?? false),
  };

  const mulRaw = raw?.multiplication ?? {};
  const mulMode: RapidArithmeticMultiplicationSettings["mode"] =
    mulRaw?.mode === "range" ? "range" : "times-table";
  const mulTablesSrc: unknown[] = Array.isArray(mulRaw?.tables)
    ? mulRaw.tables
    : [];
  const mulTables: number[] = Array.from(
    new Set<number>(
      mulTablesSrc
        .map((x: unknown) => clampInt(x, NaN))
        .filter(
          (n): n is number => Number.isFinite(n) && n >= 2 && n <= 20,
        ),
    ),
  );
  const mulMultiplier = clampRange(
    clampInt(mulRaw?.multiplierMin, 2),
    clampInt(mulRaw?.multiplierMax, 12),
  );
  const mulOperand = clampRange(
    clampInt(mulRaw?.operandMin, 0),
    clampInt(mulRaw?.operandMax, 20),
  );
  const mulAnswer = clampRange(
    clampInt(mulRaw?.answerMin, 0),
    clampInt(
      mulRaw?.answerMax,
      Math.max(
        mulOperand.max * mulOperand.max,
        (mulTables.length ? Math.max(...mulTables) : 12) * mulMultiplier.max,
      ),
    ),
  );
  const multiplication: RapidArithmeticMultiplicationSettings = {
    mode: mulMode,
    tables: mulTables.length ? mulTables : [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    multiplierMin: mulMultiplier.min,
    multiplierMax: mulMultiplier.max,
    operandMin: mulOperand.min,
    operandMax: mulOperand.max,
    answerMin: mulAnswer.min,
    answerMax: mulAnswer.max,
  };

  const divRaw = raw?.division ?? {};
  const divisor = clampRange(
    clampInt(divRaw?.divisorMin, 2),
    clampInt(divRaw?.divisorMax, 12),
  );
  const quotient = clampRange(
    clampInt(divRaw?.quotientMin, 0),
    clampInt(divRaw?.quotientMax, 20),
  );
  const divAnswer = clampRange(
    clampInt(divRaw?.answerMin, quotient.min),
    clampInt(divRaw?.answerMax, quotient.max),
  );
  const division = {
    divisorMin: Math.max(2, divisor.min),
    divisorMax: Math.max(2, divisor.max),
    quotientMin: quotient.min,
    quotientMax: quotient.max,
    answerMin: divAnswer.min,
    answerMax: divAnswer.max,
    allowNegative: Boolean(divRaw?.allowNegative ?? false),
  };

  return { addition, subtraction, multiplication, division };
}

function normalizeRapidArithmetic(doc: any): RapidArithmeticInitial {
  const rawOperators = Array.isArray(doc?.operators)
    ? doc.operators
    : ["+", "-", "*", "/"];
  const operators = rawOperators
    .map((x: any) => String(x))
    .filter((x: any) => x === "+" || x === "-" || x === "*" || x === "/");

  return {
    id: String(doc.rootQuizId ?? doc._id),
    version: Number(doc.version ?? 1),
    name: String(doc.name ?? ""),
    subject: String(doc.subject ?? ""),
    subjectColorHex: String(doc.subjectColorHex ?? ""),
    topic: String(doc.topic ?? ""),
    quizType: "rapid-arithmetic",
    typeColorHex: String(doc.typeColorHex ?? ""),
    questionCount: Math.min(20, Math.max(1, Number(doc?.questionCount ?? 10))),
    operators: (operators.length ? operators : ["+", "-", "*", "/"]) as Array<
      "+" | "-" | "*" | "/"
    >,
    timePerQuestion: Math.min(
      60,
      Math.max(5, Number(doc?.timePerQuestion ?? 12))
    ),
    choicesPerQuestion: Math.max(2, Number(doc?.choicesPerQuestion ?? 4)),
    operationSettings: normalizeRapidArithmeticSettings(doc),
  };
}

function normalizeCrosswordBank(doc: any): CrosswordBankInitial {
  const entriesBank = Array.isArray(doc?.entriesBank) ? doc.entriesBank : [];
  return {
    id: String(doc.rootQuizId ?? doc._id),
    version: Number(doc.version ?? 1),
    name: String(doc.name ?? ""),
    subject: String(doc.subject ?? ""),
    subjectColorHex: String(doc.subjectColorHex ?? ""),
    topic: String(doc.topic ?? ""),
    quizType: "crossword-bank",
    typeColorHex: String(doc.typeColorHex ?? ""),
    totalTimeLimit: normalizeNullableSeconds(doc?.totalTimeLimit),
    wordsPerQuiz: Math.min(10, Math.max(5, Number(doc?.wordsPerQuiz ?? 5))),
    entriesBank: entriesBank.map((e: any) => ({
      id: String(e?.id ?? crypto.randomUUID()),
      answer: String(e?.answer ?? ""),
      clue: String(e?.clue ?? ""),
    })),
  };
}

export async function getQuizForEdit(
  id: string,
  version?: number
): Promise<GetQuizResult> {
  const auth = await getAuthHeader();
  if (!auth) return { ok: false, message: "Not authenticated", status: 401 };

  const sp = new URLSearchParams();
  if (typeof version === "number" && Number.isFinite(version)) {
    sp.set("version", String(version));
  }

  const url = quizSvcUrl(
    `/quiz/${encodeURIComponent(id)}${sp.toString() ? `?${sp.toString()}` : ""}`
  );

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: auth },
      cache: "no-store",
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json?.ok) {
      return {
        ok: false,
        message: json?.message || "Failed to fetch quiz",
        status: resp.status,
      };
    }

    const doc = json.data;
    const type = String(doc?.quizType ?? "") as QuizType;

    const versions: number[] = Array.isArray(json.versions)
      ? json.versions
          .map((v: any) => Number(v))
          .filter((n: number) => Number.isFinite(n))
      : [Number(doc.version ?? 1)];

    const currentVersion = Number(
      doc.version ?? versions[versions.length - 1] ?? 1
    );

    if (type === "rapid") {
      return {
        ok: true,
        data: normalizeRapid(doc),
        versions,
        currentVersion,
      };
    }
    if (type === "true-false") {
      return {
        ok: true,
        data: normalizeTrueFalse(doc),
        versions,
        currentVersion,
      };
    }
    if (type === "crossword") {
      return {
        ok: true,
        data: normalizeCrossword(doc),
        versions,
        currentVersion,
      };
    }
    if (type === "crossword-bank") {
      return {
        ok: true,
        data: normalizeCrosswordBank(doc),
        versions,
        currentVersion,
      };
    }
    if (type === "rapid-arithmetic") {
      return {
        ok: true,
        data: normalizeRapidArithmetic(doc),
        versions,
        currentVersion,
      };
    }
    if (type === "basic") {
      return {
        ok: true,
        data: normalizeBasic(doc),
        versions,
        currentVersion,
      };
    }

    return { ok: false, message: "Unsupported quiz type", status: 400 };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Network error" };
  }
}
