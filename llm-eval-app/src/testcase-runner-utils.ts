import type {
  DocumentType,
  ImportedTestcase,
  QuizType,
  TestcaseDocumentRef,
  TestcaseRunRecord,
  TimerType,
} from "./types";
import { buildRunResultPdfBlob } from "./pdf/RunResultPdfDocument";

type CsvRow = Record<string, string>;

function sanitizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_");
}

function csvEscape(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sanitizeFileName(fileName);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function downloadJson(data: unknown, fileName: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
  downloadBlob(blob, fileName);
}

function normalizeLevel(
  value: string,
): ImportedTestcase["educationLevel"] | null {
  const raw = sanitizeToken(value).replace(/\s+/g, "-");
  const aliases: Record<string, ImportedTestcase["educationLevel"]> = {
    "primary-1": "primary-1",
    p1: "primary-1",
    primary1: "primary-1",
    "primary-2": "primary-2",
    p2: "primary-2",
    primary2: "primary-2",
    "primary-3": "primary-3",
    p3: "primary-3",
    primary3: "primary-3",
    "primary-4": "primary-4",
    p4: "primary-4",
    primary4: "primary-4",
    "primary-5": "primary-5",
    p5: "primary-5",
    primary5: "primary-5",
    "primary-6": "primary-6",
    p6: "primary-6",
    primary6: "primary-6",
  };
  return aliases[raw] || null;
}

function normalizeTimerType(value: string): TimerType | undefined {
  const token = sanitizeToken(value);
  if (token === "default" || token === "custom" || token === "none") {
    return token;
  }
  return undefined;
}

function normalizeDocumentType(value: unknown): DocumentType | null {
  const token = sanitizeToken(String(value || ""));
  if (token === "syllabus") return "syllabus";
  if (
    token === "question-bank" ||
    token === "questionbank" ||
    token === "question_bank" ||
    token === "past-paper" ||
    token === "pastpaper"
  ) {
    return "question-bank";
  }
  if (
    token === "subject-content" ||
    token === "subjectcontent" ||
    token === "subject_content" ||
    token === "textbook" ||
    token === "content"
  ) {
    return "subject-content";
  }
  if (token === "other" || token === "others") return "other";
  return null;
}

function normalizeQuizTypes(value: string): QuizType[] {
  const values = String(value || "")
    .split(/[|,;]+/g)
    .map((entry) => sanitizeToken(entry))
    .filter(Boolean);

  const validSet = new Set<QuizType>();
  for (const token of values) {
    if (token === "basic") validSet.add("basic");
    if (token === "rapid") validSet.add("rapid");
    if (token === "crossword") validSet.add("crossword");
    if (token === "true-false" || token === "truefalse" || token === "tf") {
      validSet.add("true-false");
    }
  }

  return Array.from(validSet);
}

function csvLineToValues(line: string): string[] {
  const values: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      values.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }
  values.push(cur);
  return values.map((value) => value.trim());
}

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return [];

  const headers = csvLineToValues(lines[0]).map((header) => sanitizeToken(header));
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = csvLineToValues(lines[i]);
    const row: CsvRow = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || "";
    });
    rows.push(row);
  }
  return rows;
}

function parseDocumentRefs(
  rawDocuments: unknown,
  rawDocumentTypes?: unknown,
): TestcaseDocumentRef[] {
  const refs: TestcaseDocumentRef[] = [];
  const pushRef = (pathValue: unknown, typeValue: unknown) => {
    const path = String(pathValue || "").trim();
    if (!path) return;
    refs.push({
      path,
      documentType: normalizeDocumentType(typeValue) || "other",
    });
  };

  if (Array.isArray(rawDocuments)) {
    for (const entry of rawDocuments) {
      if (typeof entry === "string") {
        pushRef(entry, undefined);
      } else if (entry && typeof entry === "object") {
        const row = entry as Record<string, unknown>;
        pushRef(
          row.path || row.file || row.filePath || row.documentPath,
          row.documentType || row.type || row.kind,
        );
      }
    }
  } else if (typeof rawDocuments === "string") {
    const trimmed = rawDocuments.trim();
    if (trimmed.length > 0) {
      const looksLikeJson =
        (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
        (trimmed.startsWith("{") && trimmed.endsWith("}"));

      if (looksLikeJson) {
        try {
          const parsed = JSON.parse(trimmed);
          const nested = parseDocumentRefs(parsed, rawDocumentTypes);
          refs.push(...nested);
        } catch {
          // fall through
        }
      }

      if (refs.length === 0) {
        const paths = trimmed
          .split(/[|;\n]+/g)
          .map((value) => value.trim())
          .filter(Boolean);
        const types = String(rawDocumentTypes || "")
          .split(/[|;\n]+/g)
          .map((value) => value.trim())
          .filter(Boolean);

        for (let i = 0; i < paths.length; i += 1) {
          pushRef(paths[i], types[i]);
        }
      }
    }
  }

  const used = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.path.toLowerCase()}::${ref.documentType}`;
    if (used.has(key)) return false;
    used.add(key);
    return true;
  });
}

function toTestcaseFromRecord(
  raw: Record<string, unknown>,
  index: number,
): ImportedTestcase | null {
  const id = String(
    raw.id || raw.testcase_id || raw.testcaseid || `TC-${index + 1}`,
  ).trim();
  const title = String(raw.title || raw.name || raw.testcase_name || id).trim();
  const subject = String(raw.subject || "").trim();
  const educationLevel = normalizeLevel(
    String(raw.educationLevel || raw.education_level || raw.level || ""),
  );
  const instructions = String(raw.instructions || raw.prompt || "").trim();
  const quizTypes = normalizeQuizTypes(
    String(raw.quizTypes || raw.quiz_types || raw.types || ""),
  );
  const numQuizzes = Number(raw.numQuizzes || raw.num_quizzes || 5);
  const questionsPerQuiz = Number(
    raw.questionsPerQuiz || raw.questions_per_quiz || 10,
  );
  const timerType = normalizeTimerType(
    String(raw.timerType || raw.timer_type || "default"),
  );
  const customTimerSeconds = Number(
    raw.customTimerSeconds || raw.custom_timer_seconds || 600,
  );
  const documents = parseDocumentRefs(
    raw.documents ||
      raw.document_paths ||
      raw.documentPaths ||
      raw.documentpaths ||
      raw.documents_json ||
      raw.documentsJson,
    raw.document_types || raw.documentTypes || raw.doctypes,
  );

  if (!subject || !educationLevel || !instructions || quizTypes.length === 0) {
    return null;
  }

  return {
    id,
    title,
    subject,
    educationLevel,
    instructions,
    quizTypes,
    ...(Number.isFinite(numQuizzes) ? { numQuizzes } : {}),
    ...(Number.isFinite(questionsPerQuiz) ? { questionsPerQuiz } : {}),
    ...(timerType ? { timerType } : {}),
    ...(Number.isFinite(customTimerSeconds) ? { customTimerSeconds } : {}),
    ...(documents.length > 0 ? { documents } : {}),
  };
}

export function parseImportedTestcases(params: {
  filename: string;
  content: string;
}): ImportedTestcase[] {
  const { filename, content } = params;
  const lower = filename.trim().toLowerCase();
  let cases: ImportedTestcase[] = [];

  if (lower.endsWith(".json")) {
    const parsed = JSON.parse(content);
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { testcases?: unknown[] })?.testcases)
        ? ((parsed as { testcases: unknown[] }).testcases ?? [])
        : [];
    cases = list
      .map((item, index) => toTestcaseFromRecord(item as Record<string, unknown>, index))
      .filter((item): item is ImportedTestcase => item !== null);
  } else if (lower.endsWith(".csv")) {
    const rows = parseCsv(content);
    cases = rows
      .map((row, index) => toTestcaseFromRecord(row, index))
      .filter((item): item is ImportedTestcase => item !== null);
  } else {
    throw new Error("Unsupported testcase file format. Use .json or .csv.");
  }

  const used = new Set<string>();
  return cases.map((testcase, index) => {
    let nextId = testcase.id || `TC-${index + 1}`;
    let counter = 2;
    while (used.has(nextId.toLowerCase())) {
      nextId = `${testcase.id}-${counter}`;
      counter += 1;
    }
    used.add(nextId.toLowerCase());
    return {
      ...testcase,
      id: nextId,
    };
  });
}

function metricsCsvHeaders(): string[] {
  return [
    "testcase_id",
    "testcase_title",
    "subject",
    "education_level",
    "model_id",
    "model_label",
    "model_provider",
    "model_name",
    "job_id",
    "job_status",
    "run_started_at",
    "run_completed_at",
    "quiz_pdf_file_name",
    "quiz_pdf_path_ref",
    "completion_rate_pct",
    "generation_attempt_count",
    "generation_successful_attempts",
    "generation_retry_count",
    "planning_latency_ms",
    "generation_latency_ms",
    "total_llm_latency_ms",
    "planning_input_tokens",
    "planning_output_tokens",
    "planning_total_tokens",
    "generation_input_tokens",
    "generation_output_tokens",
    "generation_total_tokens",
    "overall_input_tokens",
    "overall_output_tokens",
    "overall_total_tokens",
    "planning_estimated_cost_usd",
    "generation_estimated_cost_usd",
    "overall_estimated_cost_usd",
    "has_unpriced_calls",
  ];
}

function metricsCsvRow(record: TestcaseRunRecord): Array<string | number> {
  const metrics = record.metrics;
  const overallInputTokens =
    metrics.generationInputTokens !== null || metrics.planningInputTokens !== null
      ? (metrics.generationInputTokens || 0) + (metrics.planningInputTokens || 0)
      : "";
  const overallOutputTokens =
    metrics.generationOutputTokens !== null || metrics.planningOutputTokens !== null
      ? (metrics.generationOutputTokens || 0) + (metrics.planningOutputTokens || 0)
      : "";

  return [
    record.testcaseId,
    record.testcaseTitle,
    record.subject,
    record.educationLevel,
    record.modelId,
    record.modelLabel,
    record.modelProvider,
    record.modelName,
    record.jobId,
    record.jobStatus,
    record.runStartedAt,
    record.runCompletedAt,
    record.quizPdfFileName,
    record.quizPdfPathRef,
    metrics.completionRate.toFixed(2),
    metrics.generationAttemptCount ?? "",
    metrics.generationSuccessfulAttempts ?? "",
    metrics.retryCount,
    metrics.planningLatencyMs ?? "",
    metrics.generationLatencyMs ?? "",
    metrics.totalLlmLatencyMs ?? "",
    metrics.planningInputTokens ?? "",
    metrics.planningOutputTokens ?? "",
    metrics.planningTotalTokens ?? "",
    metrics.generationInputTokens ?? "",
    metrics.generationOutputTokens ?? "",
    metrics.generationTotalTokens ?? "",
    overallInputTokens,
    overallOutputTokens,
    metrics.overallTotalTokens ?? "",
    metrics.planningEstimatedCostUsd ?? "",
    metrics.generationEstimatedCostUsd ?? "",
    metrics.overallEstimatedCostUsd ?? "",
    String(metrics.hasUnpricedCalls),
  ];
}

function downloadCsv(params: {
  headers: string[];
  rows: Array<Array<string | number>>;
  fileName: string;
}): void {
  const { blob, fileName } = buildCsvBlob(params);
  downloadBlob(blob, fileName);
}

function buildCsvBlob(params: {
  headers: string[];
  rows: Array<Array<string | number>>;
  fileName: string;
}): { blob: Blob; fileName: string } {
  const csvContent = [
    params.headers.map(csvEscape).join(","),
    ...params.rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  return {
    blob,
    fileName: sanitizeFileName(params.fileName),
  };
}

function buildQuizPdfExportFileName(record: TestcaseRunRecord): string {
  const timestamp = record.runCompletedAt
    .replace(/[:]/g, "-")
    .replace(/\..+$/, "")
    .replace(/T/g, "_");
  return sanitizeFileName(
    `${record.testcaseId}_eval_${record.modelId}_${timestamp}.pdf`,
  );
}

function buildQuizPdfPathRef(fileName: string): string {
  return `download://${fileName}`;
}

function buildTestcaseJsonExportFileName(record: TestcaseRunRecord): string {
  return sanitizeFileName(
    `${record.testcaseId}_eval_${record.modelId}_${record.runCompletedAt
      .replace(/[:]/g, "-")
      .replace(/\..+$/, "")
      .replace(/T/g, "_")}.json`,
  );
}

function buildStructuredRunJson(record: TestcaseRunRecord): Record<string, unknown> {
  const m = record.metrics;
  const overallInputTokens =
    m.generationInputTokens !== null || m.planningInputTokens !== null
      ? (m.generationInputTokens || 0) + (m.planningInputTokens || 0)
      : null;
  const overallOutputTokens =
    m.generationOutputTokens !== null || m.planningOutputTokens !== null
      ? (m.generationOutputTokens || 0) + (m.planningOutputTokens || 0)
      : null;

  return {
    schemaVersion: "1.0",
    exportedAt: new Date().toISOString(),
    testcase: {
      id: record.testcaseId,
      title: record.testcaseTitle,
      instructions: record.testcaseInstructions || "",
      subject: record.subject,
      educationLevel: record.educationLevel,
    },
    model: {
      id: record.modelId,
      label: record.modelLabel,
      provider: record.modelProvider,
      name: record.modelName,
    },
    run: {
      jobId: record.jobId,
      status: record.jobStatus,
      startedAt: record.runStartedAt,
      completedAt: record.runCompletedAt,
      quizPdfFileName: record.quizPdfFileName,
      quizPdfPathRef: record.quizPdfPathRef,
    },
    planning: {
      provider: record.planningProvider,
      model: record.planningModel,
      error: record.planningError,
    },
    autoMetrics: {
      completionRatePct: m.completionRate,
      retryCount: m.retryCount,
      planningLatencyMs: m.planningLatencyMs,
      generationLatencyMs: m.generationLatencyMs,
      totalLlmLatencyMs: m.totalLlmLatencyMs,
      generationAttemptCount: m.generationAttemptCount,
      generationSuccessfulAttempts: m.generationSuccessfulAttempts,
      planningInputTokens: m.planningInputTokens,
      planningOutputTokens: m.planningOutputTokens,
      planningTotalTokens: m.planningTotalTokens,
      generationInputTokens: m.generationInputTokens,
      generationOutputTokens: m.generationOutputTokens,
      generationTotalTokens: m.generationTotalTokens,
      overallInputTokens,
      overallOutputTokens,
      overallTotalTokens: m.overallTotalTokens,
      planningEstimatedCostUsd: m.planningEstimatedCostUsd,
      generationEstimatedCostUsd: m.generationEstimatedCostUsd,
      overallEstimatedCostUsd: m.overallEstimatedCostUsd,
      hasUnpricedCalls: m.hasUnpricedCalls,
    },
    quizzes: Array.isArray(record.job.results?.quizzes)
      ? record.job.results?.quizzes
      : [],
  };
}

export async function getQuizPdfBlobForTestcase(
  record: TestcaseRunRecord,
  fileNameOverride?: string,
): Promise<{ blob: Blob; fileName: string; pathRef: string }> {
  const fileName = sanitizeFileName(fileNameOverride || buildQuizPdfExportFileName(record));
  const blob = await buildRunResultPdfBlob(record);
  return {
    blob,
    fileName,
    pathRef: buildQuizPdfPathRef(fileName),
  };
}

export async function exportQuizPdfForTestcase(
  record: TestcaseRunRecord,
  fileNameOverride?: string,
): Promise<{
  fileName: string;
  pathRef: string;
}> {
  const { blob, fileName, pathRef } = await getQuizPdfBlobForTestcase(
    record,
    fileNameOverride,
  );
  downloadBlob(blob, fileName);
  return { fileName, pathRef };
}

export function getTestcaseJsonBlobForTestcase(
  record: TestcaseRunRecord,
  fileNameOverride?: string,
): { blob: Blob; fileName: string } {
  const fileName = sanitizeFileName(
    fileNameOverride || buildTestcaseJsonExportFileName(record),
  );
  const json = JSON.stringify(buildStructuredRunJson(record), null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
  return { blob, fileName };
}

export function exportTestcaseJson(
  record: TestcaseRunRecord,
  fileName?: string,
): void {
  const { blob, fileName: exportFileName } = getTestcaseJsonBlobForTestcase(
    record,
    fileName,
  );
  downloadBlob(blob, exportFileName);
}

export function exportTestcaseMetricsCsv(
  record: TestcaseRunRecord,
  fileName?: string,
): void {
  const exportFileName =
    fileName ||
    sanitizeFileName(
      `${record.testcaseId}_eval_${record.modelId}_${record.runCompletedAt
        .replace(/[:]/g, "-")
        .replace(/\..+$/, "")
        .replace(/T/g, "_")}_metrics.csv`,
    );
  downloadCsv({
    headers: metricsCsvHeaders(),
    rows: [metricsCsvRow(record)],
    fileName: exportFileName,
  });
}

export function exportCombinedMetricsCsv(
  records: TestcaseRunRecord[],
  fileName: string,
): void {
  if (!records.length) return;
  downloadCsv({
    headers: metricsCsvHeaders(),
    rows: records.map(metricsCsvRow),
    fileName,
  });
}

export function getCombinedMetricsCsvBlob(
  records: TestcaseRunRecord[],
  fileName: string,
): { blob: Blob; fileName: string } | null {
  if (!records.length) return null;
  return buildCsvBlob({
    headers: metricsCsvHeaders(),
    rows: records.map(metricsCsvRow),
    fileName,
  });
}

function finalEvaluationCsvHeaders(): string[] {
  return [
    "Completion Rate (%)",
    "Retry Count",
    "Attempt Count",
    "Total LLM Latency (ms)",
    "Input Planning Tokens",
    "Output Planning Tokens",
    "Input Generation Tokens",
    "Output Generation Tokens",
    "Overall Tokens",
    "Estimated Cost (USD)",
  ];
}

function finalEvaluationCsvRow(record: TestcaseRunRecord): Array<string | number> {
  const m = record.metrics;
  return [
    m.completionRate.toFixed(2),
    m.retryCount,
    m.generationAttemptCount ?? "",
    m.totalLlmLatencyMs ?? "",
    m.planningInputTokens ?? "",
    m.planningOutputTokens ?? "",
    m.generationInputTokens ?? "",
    m.generationOutputTokens ?? "",
    m.overallTotalTokens ?? "",
    m.overallEstimatedCostUsd === null ? "" : m.overallEstimatedCostUsd.toFixed(6),
  ];
}

export function exportTestcaseFinalEvaluationCsv(
  record: TestcaseRunRecord,
  fileName?: string,
): void {
  const exportFileName =
    fileName ||
    sanitizeFileName(
      `${record.testcaseId}_eval_${record.modelId}_${record.runCompletedAt
        .replace(/[:]/g, "-")
        .replace(/\..+$/, "")
        .replace(/T/g, "_")}_final_evaluation.csv`,
    );
  downloadCsv({
    headers: finalEvaluationCsvHeaders(),
    rows: [finalEvaluationCsvRow(record)],
    fileName: exportFileName,
  });
}

export function exportCombinedFinalEvaluationCsv(
  records: TestcaseRunRecord[],
  fileName: string,
): void {
  if (!records.length) return;
  downloadCsv({
    headers: finalEvaluationCsvHeaders(),
    rows: records.map(finalEvaluationCsvRow),
    fileName,
  });
}

export function getCombinedFinalEvaluationCsvBlob(
  records: TestcaseRunRecord[],
  fileName: string,
): { blob: Blob; fileName: string } | null {
  if (!records.length) return null;
  return buildCsvBlob({
    headers: finalEvaluationCsvHeaders(),
    rows: records.map(finalEvaluationCsvRow),
    fileName,
  });
}

export function exportCombinedJson(
  records: TestcaseRunRecord[],
  fileName: string,
): void {
  if (!records.length) return;
  const payload = {
    schemaVersion: "1.0",
    exportedAt: new Date().toISOString(),
    count: records.length,
    runs: records.map(buildStructuredRunJson),
  };
  downloadJson(payload, fileName);
}
