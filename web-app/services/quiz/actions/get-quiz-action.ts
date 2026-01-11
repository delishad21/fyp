"use server";

import {
  BasicInitial,
  Cell,
  CrosswordInitial,
  CrosswordPlacedEntry,
  QuizType,
  RapidInitial,
} from "@/services/quiz/types/quizTypes";
import { getAuthHeader } from "@/services/user/session-definitions";
import { quizSvcUrl } from "@/utils/utils";

type QuizInitial = BasicInitial | RapidInitial | CrosswordInitial;

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
    if (type === "crossword") {
      return {
        ok: true,
        data: normalizeCrossword(doc),
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
