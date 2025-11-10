/* ===================== Types & Constants (Student CSV) ===================== */

export type StudentCsvCanonicalKey = "name" | "email" | "score";

export type StudentCsvRow = Record<StudentCsvCanonicalKey, string | undefined>;

/** Required canonical headers (case-insensitive) for the Student CSV */
export const STUDENT_CSV_REQUIRED_FIELDS: StudentCsvCanonicalKey[] = [
  "name",
  "email",
];

/** Header aliases accepted for the Student CSV (case-insensitive, trimmed) */
export const STUDENT_CSV_HEADER_ALIASES: Record<
  string,
  StudentCsvCanonicalKey
> = {
  // name
  name: "name",
  "full name": "name",
  "student name": "name",
  // email
  email: "email",
  "e-mail": "email",
  "email address": "email",
  // score
  score: "score",
  marks: "score",
  grade: "score",
};

/* ===================== Student CSV Helpers (Named Exports) ===================== */

export function studentNormalizeHeaderKey(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Build canonical header order from a raw Student CSV header row.
 * - Maps any case/spacing variant or alias to your canonical keys.
 * - Returns the index of each canonical key in the CSV (or -1 if absent).
 */
export function buildStudentCsvCanonicalHeader<CK extends string>(
  rawHeader: string[],
  required: CK[],
  aliases: Record<string, CK>
): {
  canonicalOrder: Record<CK, number>;
  missingRequired: CK[];
  headerErrors: string[];
} {
  const headerErrors: string[] = [];
  const seen: Partial<Record<CK, number>> = {};

  // Map normalized header strings -> CSV index (first occurrence wins)
  const normToIndex = new Map<string, number>();
  rawHeader.forEach((h, i) => {
    const norm = studentNormalizeHeaderKey(h || "");
    if (!norm) return;
    if (!normToIndex.has(norm)) normToIndex.set(norm, i);
  });

  // Resolve aliases to canonical keys
  Object.entries(aliases).forEach(([aliasRaw, canonical]) => {
    const alias = studentNormalizeHeaderKey(aliasRaw);
    if (!normToIndex.has(alias)) return;
    const idx = normToIndex.get(alias)!;

    if (seen[canonical] !== undefined) {
      headerErrors.push(
        `Duplicate columns that map to "${String(
          canonical
        )}" (e.g., "${aliasRaw}"). Keep only one.`
      );
      return;
    }
    seen[canonical] = idx;
  });

  // Required checks
  const missingRequired: CK[] = [];
  for (const k of required) {
    if (seen[k] === undefined) missingRequired.push(k);
  }

  // Build order (index = -1 means absent/optional)
  const canonicalOrder = {} as Record<CK, number>;
  const allCanonicals = Array.from(new Set(Object.values(aliases))) as CK[];
  for (const k of allCanonicals) {
    canonicalOrder[k] = seen[k] ?? -1;
  }
  for (const k of required) {
    if (!(k in canonicalOrder)) canonicalOrder[k] = seen[k] ?? -1;
  }

  return { canonicalOrder, missingRequired, headerErrors };
}

export function studentRowToCanonical<CK extends string>(
  rawRow: string[],
  order: Record<CK, number>
): Record<CK, string | undefined> {
  const out = {} as Record<CK, string | undefined>;
  (Object.keys(order) as CK[]).forEach((k) => {
    const idx = order[k];
    out[k] = idx >= 0 ? (rawRow[idx] ?? "").trim() : undefined;
  });
  return out;
}

/** Thin wrapper so you can import a named Student-specific parser if you prefer */
export function parseStudentCsv(text: string): string[][] {
  return parseCsv(text);
}

/* ===================== Generic CSV Parser (also exported) ===================== */

/**
 * CSV parser supporting:
 * - comma delimiter
 * - quoted fields with internal commas and double-quote escapes ("")
 * - CRLF / LF newlines
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";

  let i = 0;
  const n = text.length;
  let inQuotes = false;

  function commitField() {
    row.push(field);
    field = "";
  }
  function commitRow() {
    rows.push(row);
    row = [];
  }

  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      commitField();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      commitField();
      commitRow();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      commitField();
      if (i + 1 < n && text[i + 1] === "\n") i += 2;
      else i += 1;
      commitRow();
      continue;
    }

    field += ch;
    i += 1;
  }

  // flush final field/row
  commitField();
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
    commitRow();
  }

  return rows;
}
