import { IDocumentMeta } from "../models/generation-job-model";

export type GenerationDocumentType =
  | "syllabus"
  | "question-bank"
  | "subject-content"
  | "other";

export interface ParsedGenerationDocument {
  documentMeta: Pick<IDocumentMeta, "originalName" | "documentType">;
  text: string;
}

export interface BuildGenerationContextsInput {
  instructions: string;
  numQuizzes: number;
  documents: ParsedGenerationDocument[];
}

export interface BuildGenerationContextsOutput {
  perQuizContexts: string[];
  combinedExtractedText: string;
}

const MAX_INSTRUCTIONS_CHARS = 1200;
const MAX_SYLLABUS_CHARS = 2200;
const MAX_CONTENT_CHUNK_CHARS = 2200;
const MAX_QUESTION_BANK_CHUNK_CHARS = 1700;
const MAX_OTHER_CHUNK_CHARS = 1000;

function normalizeWhitespace(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function normalizeDocumentType(type?: string): GenerationDocumentType {
  if (
    type === "syllabus" ||
    type === "question-bank" ||
    type === "subject-content"
  ) {
    return type;
  }
  return "other";
}

function documentTypeLabel(type: GenerationDocumentType): string {
  switch (type) {
    case "syllabus":
      return "Syllabus";
    case "question-bank":
      return "Question Bank / Past Paper";
    case "subject-content":
      return "Subject Content";
    default:
      return "Other Reference";
  }
}

function splitIntoUnits(text: string, type: GenerationDocumentType): string[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  if (type === "question-bank") {
    const questionUnits = normalized
      .split(
        /(?=(?:\bquestion\s*\d+\b|\bq\s*\d+\b|\bq\d+\b|\d+\s*[\).]|[A-D]\s*[\).]))/gi,
      )
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (questionUnits.length >= 8) {
      return questionUnits;
    }
  }

  return normalized
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function buildRotatingChunks(
  texts: string[],
  type: GenerationDocumentType,
  numQuizzes: number,
  wordsPerChunk: number,
): string[] {
  const units = texts.flatMap((t) => splitIntoUnits(t, type));
  if (units.length === 0) return [];

  const chunks: string[] = [];
  const step = Math.max(1, Math.floor(units.length / Math.max(1, numQuizzes)));

  for (let i = 0; i < numQuizzes; i++) {
    const start = (i * step) % units.length;
    const picked: string[] = [];
    let wordCount = 0;
    let cursor = start;
    let safety = 0;

    while (wordCount < wordsPerChunk && safety < units.length * 2) {
      const unit = units[cursor];
      if (unit) {
        picked.push(unit);
        wordCount += unit.split(/\s+/).filter(Boolean).length;
      }
      cursor = (cursor + 1) % units.length;
      safety += 1;
    }

    const chunk = picked.join(" ");
    chunks.push(normalizeWhitespace(chunk));
  }

  return chunks;
}

function buildSyllabusConstraints(texts: string[]): string {
  const joined = normalizeWhitespace(texts.join(" "));
  return truncate(joined, MAX_SYLLABUS_CHARS);
}

function buildCombinedExtractedText(
  documents: ParsedGenerationDocument[],
): string {
  return documents
    .map((doc) => {
      const type = normalizeDocumentType(doc.documentMeta.documentType);
      const label = documentTypeLabel(type);
      return `\n\n=== ${doc.documentMeta.originalName} [${label}] ===\n${normalizeWhitespace(doc.text)}`;
    })
    .join("\n");
}

function buildOneContext(params: {
  instructions: string;
  syllabusConstraints: string;
  subjectContentChunk: string;
  questionBankChunk: string;
  otherChunk: string;
  quizNumber: number;
  totalQuizzes: number;
}): string {
  const sections: string[] = [];
  const instructions = truncate(
    normalizeWhitespace(params.instructions),
    MAX_INSTRUCTIONS_CHARS,
  );

  sections.push("Teacher Instructions:");
  sections.push(instructions);
  sections.push("");
  sections.push("Document Handling Guidance:");
  sections.push(
    "- Treat syllabus content as hard constraints for level and topic coverage.",
  );
  sections.push(
    "- Treat question-bank/past-paper content as style and difficulty exemplars.",
  );
  sections.push("- Treat subject content as factual grounding.");
  sections.push("- Treat other documents as supplementary context.");
  sections.push("");
  sections.push(`Batch Position: Quiz ${params.quizNumber}/${params.totalQuizzes}`);

  if (params.syllabusConstraints) {
    sections.push("");
    sections.push("Syllabus Constraints:");
    sections.push(params.syllabusConstraints);
  }

  if (params.subjectContentChunk) {
    sections.push("");
    sections.push("Subject Content Focus:");
    sections.push(
      truncate(
        normalizeWhitespace(params.subjectContentChunk),
        MAX_CONTENT_CHUNK_CHARS,
      ),
    );
  }

  if (params.questionBankChunk) {
    sections.push("");
    sections.push("Question Bank / Past Paper Exemplars:");
    sections.push(
      truncate(
        normalizeWhitespace(params.questionBankChunk),
        MAX_QUESTION_BANK_CHUNK_CHARS,
      ),
    );
  }

  if (params.otherChunk) {
    sections.push("");
    sections.push("Additional Reference Notes:");
    sections.push(
      truncate(normalizeWhitespace(params.otherChunk), MAX_OTHER_CHUNK_CHARS),
    );
  }

  return sections.join("\n");
}

export function buildGenerationContexts(
  input: BuildGenerationContextsInput,
): BuildGenerationContextsOutput {
  const documents = input.documents || [];
  const numQuizzes = Math.max(1, input.numQuizzes || 1);

  const grouped: Record<GenerationDocumentType, string[]> = {
    syllabus: [],
    "question-bank": [],
    "subject-content": [],
    other: [],
  };

  for (const doc of documents) {
    const type = normalizeDocumentType(doc.documentMeta.documentType);
    const text = normalizeWhitespace(doc.text);
    if (!text) continue;
    grouped[type].push(text);
  }

  const syllabusConstraints = buildSyllabusConstraints(grouped.syllabus);
  const subjectChunks = buildRotatingChunks(
    grouped["subject-content"],
    "subject-content",
    numQuizzes,
    260,
  );
  const questionBankChunks = buildRotatingChunks(
    grouped["question-bank"],
    "question-bank",
    numQuizzes,
    220,
  );
  const otherChunks = buildRotatingChunks(
    grouped.other,
    "other",
    numQuizzes,
    160,
  );

  const perQuizContexts = Array.from({ length: numQuizzes }, (_, index) =>
    buildOneContext({
      instructions: input.instructions,
      syllabusConstraints,
      subjectContentChunk: subjectChunks[index] || "",
      questionBankChunk: questionBankChunks[index] || "",
      otherChunk: otherChunks[index] || "",
      quizNumber: index + 1,
      totalQuizzes: numQuizzes,
    }),
  );

  return {
    perQuizContexts,
    combinedExtractedText: buildCombinedExtractedText(documents),
  };
}

