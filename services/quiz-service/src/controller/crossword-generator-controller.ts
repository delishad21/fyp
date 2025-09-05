import { Request, Response } from "express";
import {
  InputWord,
  generateCrossword,
} from "../utils/crossword/crossword-algorithm";
import { packTopLeftAndCrop } from "../utils/crossword/compact-crossword";

const WORD_MAX = 20;

/**
 * validateWords
 *
 * Purpose:
 * - Validates crossword input arrays (`words` and `clues`) before generation.
 * - Enforces length, format, and presence constraints.
 *
 * Behavior:
 * - Requires at least one word, max 10 words allowed.
 * - Each answer must:
 *   • Not be empty.
 *   • Contain only A–Z letters.
 *   • Not contain spaces.
 *   • Be ≤ WORD_MAX characters.
 * - Each clue must not be empty.
 *
 * Returns:
 * - { fieldErrors, questionErrors, ok }
 *   • fieldErrors: top-level issues (e.g. "max 10 words").
 *   • questionErrors: per-word array of error messages.
 *   • ok: boolean indicating if all checks passed.
 */
function validateWords(words: string[], clues: string[]) {
  const fieldErrors: Record<string, string | string[] | undefined> = {};
  const questionErrors: (string[] | undefined)[] = [];

  if (!words || words.length === 0) {
    fieldErrors.entries = "At least one word is required";
  }
  if (words && words.length > 10) {
    fieldErrors.entries = "Max 10 words allowed";
  }

  for (let i = 0; i < (words?.length ?? 0); i++) {
    const errs: string[] = [];
    const raw = (words[i] ?? "").trim();
    const clue = (clues?.[i] ?? "").trim();

    if (!raw) errs.push("Answer is required");
    if (!clue) errs.push("Clue is required");

    const normalized = raw.toUpperCase();
    if (/\s/.test(raw)) errs.push("Answer cannot contain spaces");
    if (!/^[A-Za-z]+$/.test(raw)) errs.push("Answer must be letters A–Z");
    if (normalized.length > WORD_MAX)
      errs.push(`Answer must be ≤ ${WORD_MAX} chars`);

    questionErrors.push(errs.length ? errs : undefined);
  }

  const hasField = Object.values(fieldErrors).some(Boolean);
  const hasRow = questionErrors.some(Boolean);

  return { fieldErrors, questionErrors, ok: !hasField && !hasRow };
}

/**
 * generateCrosswordHandler
 *
 * Express controller that processes a request to generate a crossword grid.
 *
 * Request body:
 * - words: string[] — list of answers.
 * - clues: string[] — corresponding clues.
 * - gridSize?: number — optional grid dimension (default 20).
 *
 * Flow:
 * - Validates inputs with `validateWords`.
 *   • If invalid → returns 400 with `fieldErrors` and `questionErrors`.
 * - Builds InputWord[] items (normalized answers, trimmed clues).
 * - Calls `generateCrossword` to build the grid.
 * - Packs/crops the grid using `packTopLeftAndCrop`.
 * - Responds with:
 *   • ok: true
 *   • grid: compact 2D cell structure
 *   • entries: placed word entries with positions/directions
 *   • packedHeight, packedWidth: dimensions of cropped grid
 *   • unplaced: any words that couldn’t fit
 *
 * Errors:
 * - On validation error → HTTP 400.
 * - On unexpected exception → HTTP 500 with generic "Server error".
 */
export async function generateCrosswordHandler(req: Request, res: Response) {
  try {
    const words: string[] = Array.isArray(req.body.words) ? req.body.words : [];
    const clues: string[] = Array.isArray(req.body.clues) ? req.body.clues : [];
    const size: number = Number(req.body.gridSize) || 20;

    const v = validateWords(words, clues);
    if (!v.ok) {
      return res.status(400).json({
        ok: false,
        fieldErrors: v.fieldErrors,
        questionErrors: v.questionErrors,
        message: "Please fix the errors and try again.",
      });
    }

    const items: InputWord[] = words.map((w, i) => ({
      id: String(i),
      answer: String(w || "")
        .trim()
        .toUpperCase(),
      clue: String(clues[i] || "").trim(),
    }));

    const generated = generateCrossword(items, size, {
      allowIslandFallback: true,
    });
    const packed = packTopLeftAndCrop(generated.grid, generated.entries);

    res.set("Cache-Control", "no-store");
    return res.json({
      ok: true,
      grid: packed.grid,
      entries: packed.entries, // include positions[] + direction
      packedHeight: packed.height,
      packedWidth: packed.width,
      unplaced: generated.unplaced, // optional, you can also error if non-empty
    });
  } catch (e: any) {
    console.error("[generateCrosswordHandler] error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}
