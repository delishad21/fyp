"use server";

import { quizSvcUrl } from "@/utils/utils";
import { CrosswordApiEntry, Cell, Direction } from "../types/quizTypes";
import { getAuthHeader } from "@/services/user/session-definitions";

export type Entry = Omit<CrosswordApiEntry, "direction"> & {
  direction: Direction;
};

export type GenerateCrosswordSuccess = {
  ok: true;
  grid: Cell[][];
  entries: Entry[];
  packedHeight: number;
  packedWidth: number;
  unplaced?: { id: string; answer: string; clue: string }[];
};

export type GenerateCrosswordError = {
  ok: false;
  status: number;
  message: string;
  fieldErrors?: Record<string, string | string[] | undefined>;
  questionErrors?: (string[] | undefined)[];
};

export type GenerateCrosswordResult =
  | GenerateCrosswordSuccess
  | GenerateCrosswordError;

export type GenerateCrosswordParams = {
  entries: { id?: string; answer: string; clue: string }[]; // id optional here
  gridSize?: number; // default 20
  endpoint?: string; // default "/quiz/generate-crossword"
  signal?: AbortSignal; // optional for cancellation
  authHeader?: string; // optional if your endpoint needs it
};

/** Normalize "direction" to the strict union we use client-side */
function normalizeDirection(d: string | null): Direction {
  return d === "across" || d === "down" ? d : null;
}

/**
 * Calls the crossword generator endpoint and returns a normalized, typed result.
 * Use this in your form to generate/preview before enabling the final Submit.
 */
export async function generateCrosswordPreview(
  params: GenerateCrosswordParams
): Promise<GenerateCrosswordResult> {
  const {
    entries,
    gridSize = 20,
    endpoint = quizSvcUrl("/quiz/generate-crossword"),
    signal,
  } = params;

  const words = entries.map((e) => e.answer);
  const clues = entries.map((e) => e.clue);

  const auth = await getAuthHeader();

  let resp: Response;
  try {
    if (!auth) {
      return {
        ok: false,
        status: 401,
        message: "Not authenticated",
      };
    }
    resp = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ words, clues, gridSize }),
      cache: "no-store",
      signal,
    });
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      message: "Network error. Please try again.",
    };
  }

  let json: any;
  try {
    json = await resp.json();
  } catch {
    return {
      ok: false,
      status: resp.status,
      message: "Invalid server response",
    };
  }

  if (!resp.ok || !json?.ok) {
    return {
      ok: false,
      status: resp.status,
      message:
        json?.message ??
        (resp.status >= 500
          ? "Server error"
          : "Please fix the errors and try again."),
      fieldErrors: json?.fieldErrors ?? undefined,
      questionErrors: json?.questionErrors ?? undefined,
    };
  }

  // success
  const normalizedEntries: Entry[] = Array.isArray(json.entries)
    ? json.entries.map((e: CrosswordApiEntry) => ({
        ...e,
        direction: normalizeDirection(e.direction),
      }))
    : [];

  return {
    ok: true,
    grid: json.grid ?? [],
    entries: normalizedEntries,
    packedHeight: Number(json.packedHeight) || (json.grid?.length ?? 0),
    packedWidth: Number(json.packedWidth) || (json.grid?.[0]?.length ?? 0),
    unplaced: json.unplaced ?? [],
  };
}
