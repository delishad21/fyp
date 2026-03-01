export type CrosswordBankCsvRow = {
  answer: string;
  clue: string;
};

export type CrosswordBankCsvParseResult =
  | {
      ok: true;
      rows: CrosswordBankCsvRow[];
      skippedRows: number;
    }
  | {
      ok: false;
      message: string;
    };

function normalizeHeader(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Generic CSV parser supporting:
 * - comma delimiter
 * - quoted fields with internal commas
 * - escaped quotes via double quote ("")
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

  commitField();
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
    commitRow();
  }

  return rows;
}

/**
 * Parse crossword bank CSV with required headers:
 * - word, clue
 * Header matching is case-insensitive and trimmed.
 */
export function parseCrosswordBankCsv(
  rawCsvText: string
): CrosswordBankCsvParseResult {
  const text = rawCsvText.replace(/^\uFEFF/, "");
  const matrix = parseCsv(text);
  if (!matrix.length) {
    return { ok: false, message: "CSV appears to be empty." };
  }

  const [headerRow, ...dataRows] = matrix;
  const headers = headerRow.map(normalizeHeader);

  const wordIndex = headers.findIndex((h) => h === "word");
  const clueIndex = headers.findIndex((h) => h === "clue");

  if (wordIndex < 0 || clueIndex < 0) {
    return {
      ok: false,
      message: 'CSV must include headers "word" and "clue".',
    };
  }

  const rows: CrosswordBankCsvRow[] = [];
  let skippedRows = 0;

  for (const row of dataRows) {
    const rawWord = String(row[wordIndex] ?? "").trim();
    const rawClue = String(row[clueIndex] ?? "").trim();

    if (!rawWord && !rawClue) continue;
    if (!rawWord || !rawClue) {
      skippedRows += 1;
      continue;
    }

    const answer = rawWord.toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z]+$/.test(answer)) {
      skippedRows += 1;
      continue;
    }

    rows.push({ answer, clue: rawClue });
  }

  if (!rows.length) {
    return {
      ok: false,
      message:
        "No valid rows found. Ensure each row has a letter-only word and a clue.",
    };
  }

  return { ok: true, rows, skippedRows };
}
