import type { DocumentType, QuizType } from "./types";

export const MAX_DOCUMENTS = 5;
export const MAX_DOCUMENT_SIZE_MB = 20;
export const MAX_DOCUMENT_SIZE_BYTES = MAX_DOCUMENT_SIZE_MB * 1024 * 1024;

export const QUIZ_TYPE_OPTIONS: Array<{ value: QuizType; label: string }> = [
  { value: "basic", label: "Basic" },
  { value: "rapid", label: "Rapid" },
  { value: "crossword", label: "Crossword" },
  { value: "true-false", label: "True/False" },
];

export const DOCUMENT_TYPE_OPTIONS: Array<{
  value: DocumentType;
  label: string;
}> = [
  { value: "syllabus", label: "Syllabus" },
  { value: "question-bank", label: "Question Bank / Past Paper" },
  { value: "subject-content", label: "Textbook / Content" },
  { value: "other", label: "Other" },
];

export const LEVEL_OPTIONS = [
  { value: "primary-1", label: "Primary 1" },
  { value: "primary-2", label: "Primary 2" },
  { value: "primary-3", label: "Primary 3" },
  { value: "primary-4", label: "Primary 4" },
  { value: "primary-5", label: "Primary 5" },
  { value: "primary-6", label: "Primary 6" },
];

export const SUPPORTED_EVAL_MODEL_IDS = [
  "openai-gpt-5-mini",
  "anthropic-claude-haiku-3-5",
  "google-gemini-2-5-flash",
] as const;
