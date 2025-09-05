import { QuizType } from "../types/quizTypes";

/** Normalize hex to `#rrggbb` (lowercase). Accepts `#abc`, `abc`, `#aabbcc`. */
export function normalizeHex(hex?: string) {
  if (!hex) return undefined;
  const raw = hex.trim().replace(/^#/, "");
  const six =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  return `#${six.toLowerCase()}`;
}

/** Copy incoming FormData into a new FormData for the backend (preserves Files). */
export function cloneFormData(src: FormData) {
  const out = new FormData();
  for (const [k, v] of src.entries()) out.append(k, v as any);
  return out;
}

/** Ensure the right hidden JSON field exists for each quiz type. */
export function normalizeItemsFieldForType(fd: FormData, quizType: QuizType) {
  if (quizType === "crossword") {
    if (!fd.has("entriesJson")) {
      const fallback =
        (fd.get("entriesJson") as string | null) ??
        (fd.get("itemsJson") as string | null) ??
        (fd.get("questionsJson") as string | null);
      if (fallback != null) fd.set("entriesJson", String(fallback));
    }
  } else {
    if (!fd.has("itemsJson")) {
      const fallback =
        (fd.get("itemsJson") as string | null) ??
        (fd.get("questionsJson") as string | null);
      if (fallback != null) fd.set("itemsJson", String(fallback));
    }
  }
}
