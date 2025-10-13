export function scoreMC_StrictPartial(
  selected: string[] = [],
  correct: string[] = [],
  max = 1
) {
  const correctSet = new Set(correct);
  const wrongPicked = selected.some((id) => !correctSet.has(id));
  if (wrongPicked) {
    return {
      score: 0,
      correct: false,
      details: { selected, correct, wrongPicked: true },
    };
  }
  const tp = selected.filter((id) => correctSet.has(id)).length;
  const denom = Math.max(correct.length, 1);
  const raw = tp / denom;
  const score = Math.round(raw * max * 1000) / 1000;
  const full = tp === correct.length && correct.length > 0;
  return { score, correct: full, details: { selected, correct, tp } };
}

/** Open: exact match; case-insensitive unless caseSensitive */
export function scoreOpen_Exact(
  value: string,
  accepted: { text: string; caseSensitive?: boolean }[],
  max = 1
) {
  const v = String(value ?? "");
  let ok = false;
  for (const a of accepted) {
    const A = a.caseSensitive ? a.text : a.text.toLowerCase();
    const V = a.caseSensitive ? v : v.toLowerCase();
    if (V.trim() === A.trim()) {
      ok = true;
      break;
    }
  }
  return { score: ok ? max : 0, correct: ok, details: { value: v } };
}

/** Crossword: full-word only */
export function scoreCrossword_Word(value: string, answer: string, max = 1) {
  const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();
  const ok = norm(value || "") === norm(answer || "");
  return {
    score: ok ? max : 0,
    correct: ok,
    details: { given: value, expected: answer },
  };
}
