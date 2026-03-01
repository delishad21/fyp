import { UserQuizMetaModel } from "../model/quiz-meta-model";
import {
  QUIZ_TYPES,
  QUIZ_TYPE_LABELS,
  QUIZ_TYPE_COLORS,
} from "../model/quiz-shared";
import { stringToColorHex } from "../utils/color";

export const DEFAULT_SUBJECTS: ReadonlyArray<{
  label: string;
  colorHex: string;
}> = [
  { label: "Math", colorHex: "#ef4444" },
  { label: "English", colorHex: "#3b82f6" },
  { label: "Science", colorHex: "#22c55e" },
];

export const DEFAULT_TOPICS: ReadonlyArray<{ label: string }> = [
  { label: "Arithmetic" },
];

export function buildDefaultMetaSeed() {
  return {
    subjects: DEFAULT_SUBJECTS.map((s) => ({ ...s })),
    topics: DEFAULT_TOPICS.map((t) => ({ ...t })),
  };
}

/**
 * Build the static quiz-type payload for UI filters and badges.
 *
 * Sourced from the registry in `quiz-shared`:
 *  - label: human-friendly type name
 *  - value: discriminator key (e.g., "basic", "rapid", "crossword")
 *  - colorHex: stable color per quiz type
 *
 * @returns Array<{ label: string; value: string; colorHex: string }>
 */
export function buildTypesPayload() {
  return QUIZ_TYPES.map((t) => ({
    label: QUIZ_TYPE_LABELS[t],
    value: t,
    colorHex: QUIZ_TYPE_COLORS[t],
  }));
}

/** Shape of the user’s persisted metadata document. */
export type MetaDoc = {
  subjects: { label: string; colorHex: string }[];
  topics: { label: string }[];
};

/** Normalize to case-insensitive label keys (trim + lowercase). */
export const norm = (v?: string) => (v ?? "").trim().toLowerCase();

/**
 * Case-insensitive label equality (trims whitespace).
 *
 * @example
 * sameLabel("Math", "  math ") // true
 */
export const sameLabel = (a?: string, b?: string) => norm(a) === norm(b);

/**
 * Convert a Mongo doc (or null) into the public payload used by the API.
 * Ensures the presence of the static `types` array even when the doc is absent.
 *
 * @param doc - MetaDoc or null
 * @returns { subjects, topics, types }
 */
export function toPayload(doc: MetaDoc | null) {
  return {
    subjects: doc?.subjects ?? [],
    topics: doc?.topics ?? [],
    types: buildTypesPayload(),
  };
}

/**
 * Normalize a hex-ish string to "#rrggbb" or "#rgb" if valid; otherwise undefined.
 * Not exported by default; exposed here for internal helpers.
 *
 * @param input - optional color value ("#abc", "abc", "#aabbcc", "aabbcc")
 * @returns string | undefined
 */
function normalizeHex(input?: string | null): string | undefined {
  if (!input) return undefined;
  const v = input.startsWith("#") ? input : `#${input}`;
  const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  return HEX.test(v) ? v : undefined;
}

/**
 * Resolve the effective subject color for a given user+subject pair.
 *
 * Priority:
 *  1) The user’s saved color for that subject label (case-insensitive match),
 *     normalized to a valid `#rgb`/`#rrggbb` when possible.
 *     (For legacy records, we additionally accept a `value` field as an alias.)
 *  2) Seeded default subject colors (Math/English/Science), if applicable.
 *  3) Deterministic fallback derived from the subject label (`stringToColorHex`).
 *
 * @param userId - Owner id
 * @param subject - Subject label (any spacing/case; matching is case-insensitive)
 * @returns {Promise<string>} A hex color string beginning with '#'
 *
 * @notes
 * - If `subject` is empty, returns "#ffffff" as a neutral fallback.
 * - This helper reads a minimal projection (subjects only) to limit payload size.
 * - If you later support per-tenant palettes/themes, add that hook here.
 */
export async function resolveSubjectColorHex(
  userId: string,
  subject: string
): Promise<string> {
  const s = (subject ?? "").trim();
  if (!s) return "#ffffff";

  // Fetch the user's palette once
  const meta = await UserQuizMetaModel.findOne({ owner: userId })
    .select("subjects")
    .lean<{
      subjects?: { label?: string; value?: string; colorHex?: string }[];
    } | null>();

  // Build lookup map (label and legacy value → normalized color)
  const subjectColorMap = new Map<string, string>();
  (meta?.subjects ?? []).forEach((subj) => {
    const normalized =
      normalizeHex(subj?.colorHex) ||
      (subj?.label ? stringToColorHex(subj.label) : undefined);
    if (!normalized) return;
    if (subj?.label) subjectColorMap.set(norm(subj.label), normalized);
    if (subj?.value) subjectColorMap.set(norm(subj.value), normalized); // legacy safety
  });

  const fromUserMeta = subjectColorMap.get(norm(s));
  if (fromUserMeta) return fromUserMeta;

  // Stable defaults for built-in seeded subjects.
  const fromSeededDefaults = DEFAULT_SUBJECTS.find((d) =>
    sameLabel(d.label, s)
  )?.colorHex;
  if (fromSeededDefaults) return fromSeededDefaults;

  // Use deterministic fallback for non-seeded/custom subjects.
  return stringToColorHex(s);
}
