import { Request, Response } from "express";
import {
  InputWord,
  generateCrossword,
} from "../utils/crossword/crossword-algorithm";
import { packTopLeftAndCrop } from "../utils/crossword/compact-crossword";

/** Max characters allowed per answer (enforced in validateWords). */
const WORD_MAX = 20;

/**
 * @internal validateWords
 * @purpose Validate crossword `words`/`clues` pairs before generation.
 * @input   words: string[]; clues: string[]      // same length; words[i] ↔ clues[i]
 * @rules   - At least 1 word; at most 10 words
 *          - Each answer required; letters A–Z only; no spaces; length ≤ WORD_MAX
 *          - Each clue required (non-empty)
 * @returns { fieldErrors, questionErrors, ok }
 *          fieldErrors: Record<string,string|string[]|undefined> // top-level issues
 *          questionErrors: (string[]|undefined)[]                // per-row errors
 *          ok: boolean
 * @notes   Pure validator; does not mutate inputs.
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
 * @route   POST /quiz/generate-crossword
 * @auth    none
 * @input   Body: {
 *            words: string[],            // required; answers
 *            clues: string[],            // required; same length as words
 *            gridSize?: number           // optional; default 20 (square grid)
 *          }
 * @logic   1) Validate with validateWords; on failure → 400 with fieldErrors/questionErrors
 *          2) Map to InputWord[] (answer UPPERCASE trimmed; clue trimmed)
 *          3) generateCrossword(items, size, { allowIslandFallback: true })
 *          4) packTopLeftAndCrop(grid, entries) to minimize bounding box
 * @returns 200 {
 *            ok: true,
 *            grid: Cell[][],
 *            entries: Entry[],           // id, answer, clue, direction, positions[]
 *            packedHeight: number,
 *            packedWidth: number,
 *            unplaced: InputWord[]       // any answers that could not be placed
 *          }
 * @errors  400 validation failure
 *          500 server error
 * @sideEffects
 *          - No DB writes; CPU-bound generation only.
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

    return res.json({
      ok: true,
      grid: packed.grid,
      entries: packed.entries,
      packedHeight: packed.height,
      packedWidth: packed.width,
      unplaced: generated.unplaced,
    });
  } catch (e: any) {
    console.error("[generateCrosswordHandler] error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}
