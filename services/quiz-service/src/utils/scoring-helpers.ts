export function scoreMC_StrictPartial(
  selected: string[] = [],
  correct: string[] = [],
  max = 1,
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
  max = 1,
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
  return {
    score: ok ? max : 0,
    correct: ok,
    details: { value: v, correct: accepted },
  };
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

/** Open: fuzzy match with Levenshtein distance - allows typos and minor variations */
export function scoreOpen_Fuzzy(
  value: string,
  accepted: {
    text: string;
    caseSensitive?: boolean;
    similarityThreshold?: number;
  }[],
  max = 1,
) {
  const v = String(value ?? "").trim();
  let bestScore = 0;
  let matchedText = "";

  for (const a of accepted) {
    const threshold = a.similarityThreshold ?? 0.85;
    const target = a.caseSensitive ? a.text : a.text.toLowerCase();
    const input = a.caseSensitive ? v : v.toLowerCase();

    // Normalize: remove extra spaces, articles, punctuation
    const normalizedTarget = normalizeString(target);
    const normalizedInput = normalizeString(input);

    // Exact match after normalization gets full credit
    if (normalizedInput === normalizedTarget) {
      return {
        score: max,
        correct: true,
        details: { value: v, matched: a.text, similarity: 1.0 },
      };
    }

    // Calculate Levenshtein similarity
    const similarity = calculateSimilarity(normalizedInput, normalizedTarget);
    if (similarity > bestScore) {
      bestScore = similarity;
      matchedText = a.text;
    }
  }

  // Use the threshold from first accepted answer as default
  const threshold = accepted[0]?.similarityThreshold ?? 0.85;
  const passes = bestScore >= threshold;

  return {
    score: passes ? max : 0,
    correct: passes,
    details: {
      value: v,
      matched: matchedText,
      similarity: Math.round(bestScore * 100) / 100,
      threshold,
    },
  };
}

/** Open: keyword matching - awards points for including key terms */
export function scoreOpen_Keywords(
  value: string,
  config: { keywords: string[]; minRequired: number },
  max = 1,
) {
  const v = String(value ?? "").toLowerCase();
  const tokens = tokenize(v);
  const keywordsLower = (config.keywords || []).map((k) => k.toLowerCase());

  const matchedKeywords: string[] = [];
  for (const kw of keywordsLower) {
    const found = tokens.some(
      (token) =>
        token.includes(kw) ||
        kw.includes(token) ||
        calculateSimilarity(token, kw) > 0.9,
    );
    if (found) {
      matchedKeywords.push(kw);
    }
  }

  const matchedCount = matchedKeywords.length;
  const passes = matchedCount >= config.minRequired;
  const partialScore =
    config.keywords.length > 0 ? matchedCount / config.keywords.length : 0;

  return {
    score: passes ? max : Math.round(partialScore * max * 100) / 100,
    correct: passes,
    details: {
      value: v,
      matchedKeywords: matchedCount,
      requiredKeywords: config.minRequired,
      totalKeywords: config.keywords.length,
      matched: matchedKeywords,
    },
  };
}

/** Open: list matching - handles multiple items in any/specific order */
export function scoreOpen_List(
  value: string,
  config: { items: string[]; requireOrder: boolean; minCorrect: number },
  max = 1,
) {
  // Split by common delimiters: comma, semicolon, newline, "and", "or"
  const studentItems = value
    .toLowerCase()
    .split(/[,;\n]|(?:\s+and\s+)|(?:\s+or\s+)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const acceptedLower = (config.items || []).map((i) =>
    normalizeString(i.toLowerCase()),
  );

  if (config.requireOrder) {
    // Check if items appear in order (can have items in between)
    let matchIndex = 0;
    const matched: string[] = [];

    for (const item of studentItems) {
      const normalized = normalizeString(item);
      if (matchIndex < acceptedLower.length) {
        // Check for fuzzy match
        const similarity = calculateSimilarity(
          normalized,
          acceptedLower[matchIndex],
        );
        if (similarity > 0.85) {
          matched.push(acceptedLower[matchIndex]);
          matchIndex++;
        }
      }
    }

    const orderedCorrect = matched.length;
    const passes = orderedCorrect >= config.minCorrect;
    const partialScore =
      acceptedLower.length > 0 ? orderedCorrect / acceptedLower.length : 0;

    return {
      score: passes ? max : Math.round(partialScore * max * 100) / 100,
      correct: passes,
      details: {
        orderedMatches: orderedCorrect,
        required: config.minCorrect,
        matched,
      },
    };
  } else {
    // Any order - count matches with fuzzy matching
    const acceptedSet = new Set(acceptedLower);
    const matched: string[] = [];

    for (const item of studentItems) {
      const normalized = normalizeString(item);

      // Try exact match first
      if (acceptedSet.has(normalized)) {
        matched.push(normalized);
        acceptedSet.delete(normalized);
        continue;
      }

      // Try fuzzy match
      for (const accepted of acceptedSet) {
        const similarity = calculateSimilarity(normalized, accepted);
        if (similarity > 0.85) {
          matched.push(accepted);
          acceptedSet.delete(accepted);
          break;
        }
      }
    }

    const correctCount = matched.length;
    const passes = correctCount >= config.minCorrect;
    const partialScore =
      acceptedLower.length > 0 ? correctCount / acceptedLower.length : 0;

    return {
      score: passes ? max : Math.round(partialScore * max * 100) / 100,
      correct: passes,
      details: {
        matches: correctCount,
        required: config.minCorrect,
        total: config.items.length,
        matched,
      },
    };
  }
}

/* ─────────────────────── Helper Functions ──────────────────────────── */

function normalizeString(s: string): string {
  return s
    .replace(/[.,!?;:'"()[\]{}]/g, "") // Remove punctuation
    .replace(/\b(the|a|an)\b/gi, "") // Remove articles
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim()
    .toLowerCase();
}

function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2); // Ignore short words
}
