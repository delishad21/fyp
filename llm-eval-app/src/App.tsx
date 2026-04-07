import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import AuthSettingsCard from "./components/AuthSettingsCard";
import RunConfigurationCard from "./components/RunConfigurationCard";
import RunResultsCard from "./components/RunResultsCard";
import TestcaseRunnerCard from "./components/TestcaseRunnerCard";
import {
  MAX_DOCUMENTS,
  MAX_DOCUMENT_SIZE_BYTES,
  MAX_DOCUMENT_SIZE_MB,
  SUPPORTED_EVAL_MODEL_IDS,
} from "./constants";
import type {
  AIModel,
  DocumentType,
  GenerationJob,
  Metrics,
  QuizType,
  TestcaseDocumentRef,
  TestcaseRecord,
  TestcaseRunRecord,
  TimerType,
  UploadedReferenceDocument,
} from "./types";
import {
  computeMetrics,
  guessDocumentType,
  normalizeAuth,
  parseMaybeJson,
} from "./utils";
import {
  exportCombinedFinalEvaluationCsv,
  exportCombinedMetricsCsv,
  exportTestcaseFinalEvaluationCsv,
  exportTestcaseJson,
  getTestcaseJsonBlobForTestcase,
  exportTestcaseMetricsCsv,
  getQuizPdfBlobForTestcase,
  getCombinedFinalEvaluationCsvBlob,
  getCombinedMetricsCsvBlob,
  exportQuizPdfForTestcase,
  parseImportedTestcases,
} from "./testcase-runner-utils";

const DEFAULT_AI_URL =
  import.meta.env.VITE_AI_SVC_URL?.trim() || "http://localhost:7304";
const DEFAULT_USER_URL =
  import.meta.env.VITE_USER_SVC_URL?.trim() || "http://localhost:7301";
const DEFAULT_TEACHER_IDENTIFIER =
  import.meta.env.VITE_TEACHER_IDENTIFIER?.trim() || "";
const DEFAULT_TEACHER_PASSWORD =
  import.meta.env.VITE_TEACHER_PASSWORD?.trim() || "";
const DEFAULT_ANALYTICS_SECRET =
  import.meta.env.VITE_AI_ANALYTICS_SECRET?.trim() || "";
const AUTO_LOGIN_ENABLED =
  (import.meta.env.VITE_AUTO_LOGIN?.trim().toLowerCase() ?? "true") !==
  "false";

function createFallbackMetrics(): Metrics {
  return {
    completionRate: 0,
    planningLatencyMs: null,
    generationLatencyMs: null,
    totalLlmLatencyMs: null,
    planningFallbackUsed: null,
    planningSuccess: null,
    planningPlanItemCount: null,
    planningInputTokens: null,
    planningOutputTokens: null,
    planningTotalTokens: null,
    overallTotalTokens: null,
    generationAttemptCount: null,
    generationSuccessfulAttempts: null,
    generationInputTokens: null,
    generationOutputTokens: null,
    generationTotalTokens: null,
    planningEstimatedCostUsd: null,
    generationEstimatedCostUsd: null,
    overallEstimatedCostUsd: null,
    hasUnpricedCalls: false,
    retryCount: 0,
    wallClockMs: null,
  };
}

function makeSafeFileToken(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function buildArtifactBaseName(
  record: Pick<TestcaseRunRecord, "testcaseId" | "testcaseTitle" | "modelLabel">,
): string {
  return makeSafeFileToken(
    `${record.testcaseId}_${record.testcaseTitle}_${record.modelLabel}`,
  );
}

function downloadBlobFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function normalizePathToken(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\//, "")
    .toLowerCase();
}

function orderAndFilterSupportedModels(models: AIModel[]): AIModel[] {
  const byId = new Map(models.map((model) => [model.id, model]));
  return SUPPORTED_EVAL_MODEL_IDS.map((id) => byId.get(id)).filter(
    (model): model is AIModel => !!model,
  );
}

function getPathBasename(value: string): string {
  const normalized = normalizePathToken(value);
  if (!normalized) return "";
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : normalized;
}

function resolveTestcaseDocuments(params: {
  refs?: TestcaseDocumentRef[];
  attachedDocuments: UploadedReferenceDocument[];
}): {
  resolved: UploadedReferenceDocument[];
  missing: string[];
} {
  const refs = Array.isArray(params.refs) ? params.refs : [];
  if (refs.length === 0) {
    return { resolved: [], missing: [] };
  }

  const byFullPath = new Map<string, UploadedReferenceDocument>();
  const byBaseName = new Map<string, UploadedReferenceDocument[]>();
  for (const document of params.attachedDocuments) {
    const sourcePath = document.sourcePath || document.file.name;
    const full = normalizePathToken(sourcePath);
    const base = getPathBasename(sourcePath);
    if (full && !byFullPath.has(full)) {
      byFullPath.set(full, document);
    }
    if (base) {
      byBaseName.set(base, [...(byBaseName.get(base) || []), document]);
    }
  }

  const resolved: UploadedReferenceDocument[] = [];
  const missing: string[] = [];

  for (const ref of refs) {
    const normalizedRef = normalizePathToken(ref.path);
    const baseRef = getPathBasename(ref.path);
    let match: UploadedReferenceDocument | undefined;

    if (normalizedRef) {
      match = byFullPath.get(normalizedRef);
    }
    if (!match && baseRef) {
      match = byBaseName.get(baseRef)?.[0];
    }
    if (!match && normalizedRef) {
      match = params.attachedDocuments.find((entry) => {
        const sourcePath = normalizePathToken(entry.sourcePath || entry.file.name);
        return sourcePath.endsWith(`/${normalizedRef}`);
      });
    }

    if (!match) {
      missing.push(ref.path);
      continue;
    }

    resolved.push({
      ...match,
      id: `${match.id}-${resolved.length + 1}`,
      documentType: ref.documentType,
    });
  }

  return { resolved, missing };
}

export default function App() {
  const [aiServiceUrl, setAiServiceUrl] = useState(DEFAULT_AI_URL);
  const [userServiceUrl, setUserServiceUrl] = useState(DEFAULT_USER_URL);
  const [teacherIdentifier, setTeacherIdentifier] = useState(
    DEFAULT_TEACHER_IDENTIFIER,
  );
  const [teacherPassword, setTeacherPassword] = useState(
    DEFAULT_TEACHER_PASSWORD,
  );
  const [accessToken, setAccessToken] = useState("");
  const [analyticsSecret, setAnalyticsSecret] = useState(
    DEFAULT_ANALYTICS_SECRET,
  );
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authStatus, setAuthStatus] = useState("");
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);

  const [subject, setSubject] = useState("Math");
  const [educationLevel, setEducationLevel] = useState("primary-4");
  const [instructions, setInstructions] = useState("");
  const [numQuizzes, setNumQuizzes] = useState(5);
  const [questionsPerQuiz, setQuestionsPerQuiz] = useState(10);
  const [selectedQuizTypes, setSelectedQuizTypes] = useState<QuizType[]>([
    "basic",
    "rapid",
    "crossword",
    "true-false",
  ]);
  const [timerType, setTimerType] = useState<TimerType>("default");
  const [customTimerSeconds, setCustomTimerSeconds] = useState(600);
  const [documents, setDocuments] = useState<UploadedReferenceDocument[]>([]);

  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [runnerModelId, setRunnerModelId] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);

  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [testcases, setTestcases] = useState<TestcaseRecord[]>([]);
  const [runRecords, setRunRecords] = useState<TestcaseRunRecord[]>([]);
  const [activeTestcaseId, setActiveTestcaseId] = useState("");
  const [queuedTestcaseIds, setQueuedTestcaseIds] = useState<string[]>([]);
  const [queuedRunDelaySeconds, setQueuedRunDelaySeconds] = useState(0);
  const [queueResumeAtMs, setQueueResumeAtMs] = useState<number | null>(null);
  const [runAllTotalCount, setRunAllTotalCount] = useState(0);
  const [runAllDoneCount, setRunAllDoneCount] = useState(0);
  const [autoDownloadAllOnQueueComplete, setAutoDownloadAllOnQueueComplete] =
    useState(false);
  const autoDownloadTriggeredRef = useRef(false);
  const [activeRunContext, setActiveRunContext] = useState<{
    testcaseId: string;
    testcaseTitle: string;
    testcaseInstructions: string;
    subject: string;
    educationLevel: string;
    runStartedAtIso: string;
    modelId: string;
    modelLabel: string;
    modelProvider: string;
    modelName: string;
  } | null>(null);
  const processedRunJobKeysRef = useRef<Set<string>>(new Set());

  const metrics = useMemo(
    () => computeMetrics(job, runStartedAt),
    [job, runStartedAt],
  );

  useEffect(() => {
    const raw = localStorage.getItem("llm-eval-app-config");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.aiServiceUrl === "string") {
        setAiServiceUrl(parsed.aiServiceUrl);
      }
      if (typeof parsed.userServiceUrl === "string") {
        setUserServiceUrl(parsed.userServiceUrl);
      }
      if (typeof parsed.teacherIdentifier === "string") {
        setTeacherIdentifier(parsed.teacherIdentifier);
      }
      if (typeof parsed.subject === "string") {
        setSubject(parsed.subject);
      }
      if (typeof parsed.educationLevel === "string") {
        setEducationLevel(parsed.educationLevel);
      }
      if (typeof parsed.instructions === "string") {
        setInstructions(parsed.instructions);
      }
      if (typeof parsed.numQuizzes === "number") {
        setNumQuizzes(parsed.numQuizzes);
      }
      if (typeof parsed.questionsPerQuiz === "number") {
        setQuestionsPerQuiz(parsed.questionsPerQuiz);
      }
      if (
        Array.isArray(parsed.selectedQuizTypes) &&
        parsed.selectedQuizTypes.every((type: unknown) =>
          ["basic", "rapid", "crossword", "true-false"].includes(
            String(type),
          ),
        )
      ) {
        setSelectedQuizTypes(parsed.selectedQuizTypes as QuizType[]);
      }
      if (["default", "custom", "none"].includes(String(parsed.timerType))) {
        setTimerType(parsed.timerType as TimerType);
      }
      if (typeof parsed.customTimerSeconds === "number") {
        setCustomTimerSeconds(parsed.customTimerSeconds);
      }
      if (typeof parsed.accessToken === "string") {
        setAccessToken(parsed.accessToken);
      }
      if (typeof parsed.analyticsSecret === "string") {
        setAnalyticsSecret(parsed.analyticsSecret);
      }
      if (typeof parsed.runnerModelId === "string") {
        setRunnerModelId(parsed.runnerModelId);
      }
    } catch {
      // ignore malformed cache
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "llm-eval-app-config",
      JSON.stringify({
        aiServiceUrl,
        userServiceUrl,
        teacherIdentifier,
        subject,
        educationLevel,
        instructions,
        numQuizzes,
        questionsPerQuiz,
        selectedQuizTypes,
        timerType,
        customTimerSeconds,
        accessToken,
        analyticsSecret,
        runnerModelId,
      }),
    );
  }, [
    aiServiceUrl,
    userServiceUrl,
    teacherIdentifier,
    subject,
    educationLevel,
    instructions,
    numQuizzes,
    questionsPerQuiz,
    selectedQuizTypes,
    timerType,
    customTimerSeconds,
    accessToken,
    analyticsSecret,
    runnerModelId,
  ]);

  useEffect(() => {
    setAutoLoginAttempted(false);
  }, [userServiceUrl, teacherIdentifier, teacherPassword]);

  useEffect(() => {
    if (!runnerModelId && selectedModel) {
      setRunnerModelId(selectedModel);
    }
  }, [runnerModelId, selectedModel]);

  useEffect(() => {
    if (!jobId || !accessToken.trim()) return;
    if (job?.status === "completed" || job?.status === "failed") return;

    let cancelled = false;

    const poll = async () => {
      try {
        const url = new URL(`${aiServiceUrl.replace(/\/$/, "")}/${jobId}`);
        if (analyticsSecret.trim()) {
          url.searchParams.set("analyticsSecret", analyticsSecret.trim());
        }

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Authorization: normalizeAuth(accessToken),
          },
        });

        const text = await response.text();
        const data = parseMaybeJson(text);

        if (!response.ok || !data?.ok || !data?.job) {
          if (!cancelled) {
            setError(data?.message || `Failed to fetch status (${response.status})`);
          }
          return;
        }

        if (!cancelled) {
          setJob(data.job as GenerationJob);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Status polling failed");
        }
      }
    };

    poll();
    const interval = window.setInterval(poll, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [jobId, job?.status, accessToken, analyticsSecret, aiServiceUrl]);

  useEffect(() => {
    if (!job || !activeRunContext) return;
    if (job.status !== "completed" && job.status !== "failed") return;
    if (!job.id) return;

    const processKey = `${job.id}:${activeRunContext.testcaseId}`;
    if (processedRunJobKeysRef.current.has(processKey)) return;
    processedRunJobKeysRef.current.add(processKey);

    const metricsForRecord = computeMetrics(job, runStartedAt) || createFallbackMetrics();
    const runCompletedAt = new Date().toISOString();
    const planning = job.analytics?.planning;

    const baseRecord: TestcaseRunRecord = {
      testcaseId: activeRunContext.testcaseId,
      testcaseTitle: activeRunContext.testcaseTitle,
      testcaseInstructions: activeRunContext.testcaseInstructions,
      subject: activeRunContext.subject,
      educationLevel: activeRunContext.educationLevel,
      modelId: activeRunContext.modelId,
      modelLabel: activeRunContext.modelLabel,
      modelProvider: activeRunContext.modelProvider,
      modelName: activeRunContext.modelName,
      runStartedAt: activeRunContext.runStartedAtIso,
      runCompletedAt,
      jobId: job.id,
      jobStatus: job.status,
      metrics: metricsForRecord,
      planningProvider: String(planning?.provider || ""),
      planningModel: String(planning?.model || ""),
      planningError: String(planning?.error || ""),
      quizPdfFileName: "",
      quizPdfPathRef: "",
      job,
    };

    const pdfFileName =
      job.status === "completed" ? `${buildArtifactBaseName(baseRecord)}.pdf` : "";
    const pdfPathRef = pdfFileName ? `download://${pdfFileName}` : "";
    const record: TestcaseRunRecord = {
      ...baseRecord,
      quizPdfFileName: pdfFileName,
      quizPdfPathRef: pdfPathRef,
    };

    const updatedRecords = [
      ...runRecords.filter((entry) => entry.jobId !== job.id),
      record,
    ];
    setRunRecords(updatedRecords);

    setTestcases((prev) =>
      prev.map((entry) =>
        entry.id === activeRunContext.testcaseId
          ? {
              ...entry,
              status: job.status === "completed" ? "completed" : "failed",
              lastJobId: job.id,
              lastModelId: activeRunContext.modelId,
              lastModelLabel: activeRunContext.modelLabel,
              lastError: job.status === "failed" ? job.error || "Run failed" : "",
              lastRunCompletedAt: runCompletedAt,
            }
          : entry,
      ),
    );

    if (job.status === "failed" && queuedTestcaseIds.length > 0) {
      setQueuedTestcaseIds([]);
      setQueueResumeAtMs(null);
      setAutoDownloadAllOnQueueComplete(false);
      autoDownloadTriggeredRef.current = false;
      setRunAllTotalCount(0);
      setRunAllDoneCount(0);
      setError(
        `Testcase "${activeRunContext.testcaseTitle}" failed. Run-all stopped at first failure.`,
      );
    }

    if (job.status === "completed" && queuedTestcaseIds.length > 0) {
      if (queuedRunDelaySeconds > 0) {
        setQueueResumeAtMs(Date.now() + queuedRunDelaySeconds * 1000);
      } else {
        setQueueResumeAtMs(null);
      }
    }
    if (autoDownloadAllOnQueueComplete) {
      setRunAllDoneCount((prev) => Math.min(runAllTotalCount, prev + 1));
    }

    setActiveTestcaseId("");
    setActiveRunContext(null);
  }, [
    activeRunContext,
    autoDownloadAllOnQueueComplete,
    job,
    queuedTestcaseIds,
    queuedRunDelaySeconds,
    runAllTotalCount,
    runRecords,
    runStartedAt,
  ]);

  const loadModels = async (tokenOverride?: string) => {
    setLoadingModels(true);
    setError("");

    const token = tokenOverride ?? accessToken;
    if (!token.trim()) {
      setError("Access token is required");
      setLoadingModels(false);
      return;
    }

    try {
      const response = await fetch(`${aiServiceUrl.replace(/\/$/, "")}/models`, {
        method: "GET",
        headers: {
          Authorization: normalizeAuth(token),
        },
      });

      const text = await response.text();
      const data = parseMaybeJson(text);

      if (!response.ok || !data?.ok) {
        setError(data?.message || `Unable to load models (${response.status})`);
        setModels([]);
        setSelectedModel("");
        return;
      }

      const list = Array.isArray(data.models) ? (data.models as AIModel[]) : [];
      const supportedModels = orderAndFilterSupportedModels(list);
      if (supportedModels.length === 0) {
        setError(
          "No supported eval models are currently available. Configure API keys for GPT-5 mini, Claude Haiku 4.5, or Gemini 2.5 Flash.",
        );
        setModels([]);
        setSelectedModel("");
        setRunnerModelId("");
        return;
      }

      const requestedDefaultId = String(data.defaultModelId || "").trim();
      const defaultModelId =
        supportedModels.some((model) => model.id === requestedDefaultId)
          ? requestedDefaultId
          : supportedModels[0]?.id || "";

      setModels(supportedModels);
      setSelectedModel(defaultModelId);
      setRunnerModelId((prev) =>
        supportedModels.some((model) => model.id === prev)
          ? prev
          : defaultModelId,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load models");
      setModels([]);
      setSelectedModel("");
      setRunnerModelId("");
    } finally {
      setLoadingModels(false);
    }
  };

  const signInAndFetchToken = async (silent = false) => {
    if (!teacherIdentifier.trim() || !teacherPassword) {
      if (!silent) {
        setError("Teacher username/email and password are required");
      }
      return null;
    }

    setIsSigningIn(true);
    if (!silent) {
      setError("");
    }

    try {
      const response = await fetch(
        `${userServiceUrl.replace(/\/$/, "")}/teacher/auth/sign-in`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            identifier: teacherIdentifier.trim(),
            password: teacherPassword,
          }),
        },
      );

      const text = await response.text();
      const data = parseMaybeJson(text);

      if (!response.ok) {
        if (!silent) {
          setError(data?.message || `Sign-in failed (${response.status})`);
        }
        setAuthStatus("");
        return null;
      }

      const token = String(data?.data?.accessToken || "").trim();
      if (!token) {
        if (!silent) {
          setError("Sign-in succeeded but access token was missing");
        }
        setAuthStatus("");
        return null;
      }

      setAccessToken(token);
      setAuthStatus(`Signed in as ${teacherIdentifier.trim()}`);
      void loadModels(token);
      return token;
    } catch (e) {
      if (!silent) {
        setError(e instanceof Error ? e.message : "Sign-in failed");
      }
      setAuthStatus("");
      return null;
    } finally {
      setIsSigningIn(false);
    }
  };

  useEffect(() => {
    if (autoLoginAttempted || !AUTO_LOGIN_ENABLED || !!accessToken.trim()) {
      return;
    }
    if (!teacherIdentifier.trim() || !teacherPassword) {
      return;
    }

    setAutoLoginAttempted(true);
    void signInAndFetchToken(true);
  }, [
    autoLoginAttempted,
    accessToken,
    teacherIdentifier,
    teacherPassword,
    userServiceUrl,
  ]);

  const toggleQuizType = (quizType: QuizType) => {
    setSelectedQuizTypes((prev) => {
      if (prev.includes(quizType)) {
        return prev.filter((type) => type !== quizType);
      }
      return [...prev, quizType];
    });
  };

  const addDocuments = (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files);
    if (list.length === 0) return;

    const acceptedMimeTypes = new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ]);

    const accepted: UploadedReferenceDocument[] = [];
    for (const file of list) {
      if (!acceptedMimeTypes.has(file.type)) {
        setError(
          `Unsupported file type for ${file.name}. Only PDF, DOCX, and TXT are allowed.`,
        );
        continue;
      }

      if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
        setError(
          `${file.name} exceeds ${MAX_DOCUMENT_SIZE_MB}MB. Please upload a smaller file.`,
        );
        continue;
      }

      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        documentType: guessDocumentType(file),
        sourcePath: (file as File & { webkitRelativePath?: string })
          .webkitRelativePath || file.name,
      });
    }

    setDocuments((prev) => {
      const merged = [...prev, ...accepted];
      if (merged.length > MAX_DOCUMENTS) {
        setError(`You can upload up to ${MAX_DOCUMENTS} documents only.`);
      }
      return merged.slice(0, MAX_DOCUMENTS);
    });
  };

  const updateDocumentType = (id: string, documentType: DocumentType) => {
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === id ? { ...doc, documentType } : doc)),
    );
  };

  const removeDocument = (id: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
  };

  const startRun = async (
    override?: Partial<{
      subject: string;
      educationLevel: string;
      instructions: string;
      numQuizzes: number;
      questionsPerQuiz: number;
      selectedQuizTypes: QuizType[];
      timerType: TimerType;
      customTimerSeconds: number;
      documents: UploadedReferenceDocument[];
      aiModelId: string;
    }>,
  ): Promise<string | null> => {
    setError("");

    const requestedSubject = override?.subject ?? subject;
    const requestedLevel = override?.educationLevel ?? educationLevel;
    const requestedInstructions = override?.instructions ?? instructions;
    const requestedNumQuizzes = override?.numQuizzes ?? numQuizzes;
    const requestedQuestionsPerQuiz =
      override?.questionsPerQuiz ?? questionsPerQuiz;
    const requestedQuizTypes = override?.selectedQuizTypes ?? selectedQuizTypes;
    const requestedTimerType = override?.timerType ?? timerType;
    const requestedCustomTimerSeconds =
      override?.customTimerSeconds ?? customTimerSeconds;
    const requestedDocuments = override?.documents ?? documents;
    const requestedModelId = override?.aiModelId ?? selectedModel;

    if (!accessToken.trim()) {
      setError("Access token is required");
      return null;
    }
    if (!requestedModelId) {
      setError("Load models and select one model");
      return null;
    }
    if (!requestedInstructions.trim()) {
      setError("Instructions are required");
      return null;
    }
    if (!requestedSubject.trim()) {
      setError("Subject is required");
      return null;
    }
    if (requestedQuizTypes.length === 0) {
      setError("Select at least one quiz type");
      return null;
    }
    if (requestedNumQuizzes < 1 || requestedNumQuizzes > 20) {
      setError("numQuizzes must be between 1 and 20");
      return null;
    }
    if (requestedQuestionsPerQuiz < 5 || requestedQuestionsPerQuiz > 20) {
      setError("questionsPerQuiz must be between 5 and 20");
      return null;
    }
    if (
      requestedTimerType === "custom" &&
      (requestedCustomTimerSeconds < 60 || requestedCustomTimerSeconds > 3600)
    ) {
      setError("Custom timer must be between 60 and 3600 seconds");
      return null;
    }

    setIsSubmitting(true);
    try {
      setSubject(requestedSubject);
      setEducationLevel(requestedLevel);
      setInstructions(requestedInstructions);
      setNumQuizzes(requestedNumQuizzes);
      setQuestionsPerQuiz(requestedQuestionsPerQuiz);
      setSelectedQuizTypes(requestedQuizTypes);
      setTimerType(requestedTimerType);
      setCustomTimerSeconds(requestedCustomTimerSeconds);
      setDocuments(requestedDocuments);

      const form = new FormData();
      form.append("instructions", requestedInstructions.trim());
      form.append("numQuizzes", String(requestedNumQuizzes));
      form.append("questionsPerQuiz", String(requestedQuestionsPerQuiz));
      form.append("educationLevel", requestedLevel);
      form.append("subject", requestedSubject);
      form.append("aiModel", requestedModelId);
      form.append(
        "timerSettings",
        JSON.stringify({
          type: requestedTimerType,
          defaultSeconds:
            requestedTimerType === "custom"
              ? requestedCustomTimerSeconds
              : undefined,
        }),
      );

      for (const quizType of requestedQuizTypes) {
        form.append("quizTypes", quizType);
      }

      for (const document of requestedDocuments) {
        form.append("documents", document.file);
        form.append("documentTypes", document.documentType);
      }

      const response = await fetch(`${aiServiceUrl.replace(/\/$/, "")}/`, {
        method: "POST",
        headers: {
          Authorization: normalizeAuth(accessToken),
        },
        body: form,
      });

      const text = await response.text();
      const data = parseMaybeJson(text);

      if (!response.ok || !data?.ok || !data?.jobId) {
        setError(data?.message || `Failed to start run (${response.status})`);
        return null;
      }

      setJobId(String(data.jobId));
      setJob(null);
      setRunStartedAt(Date.now());
      return String(data.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start run");
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  const importTestcaseFile = async (file: File) => {
    try {
      const content = await file.text();
      const parsed = parseImportedTestcases({
        filename: file.name,
        content,
      });

      if (!parsed.length) {
        setError("No valid testcases found in file.");
        return;
      }

      setTestcases(
        parsed.map((testcase) => ({
          ...testcase,
          status: "idle",
        })),
      );
      setRunRecords([]);
      setActiveTestcaseId("");
      setQueuedTestcaseIds([]);
      setActiveRunContext(null);
      setAutoDownloadAllOnQueueComplete(false);
      autoDownloadTriggeredRef.current = false;
      setRunAllTotalCount(0);
      setRunAllDoneCount(0);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to import testcase file",
      );
    }
  };

  const applyTestcaseToForm = (testcaseId: string) => {
    const testcase = testcases.find((entry) => entry.id === testcaseId);
    if (!testcase) return;

    setSubject(testcase.subject);
    setEducationLevel(testcase.educationLevel);
    setInstructions(testcase.instructions);
    setSelectedQuizTypes(testcase.quizTypes);
    setNumQuizzes(testcase.numQuizzes ?? 5);
    setQuestionsPerQuiz(testcase.questionsPerQuiz ?? 10);
    setTimerType(testcase.timerType ?? "default");
    setCustomTimerSeconds(testcase.customTimerSeconds ?? 600);
  };

  const runImportedTestcase = async (testcaseId: string) => {
    const failRun = (message: string) => {
      if (queuedTestcaseIds.length > 0) {
        setQueuedTestcaseIds([]);
        setQueueResumeAtMs(null);
        setAutoDownloadAllOnQueueComplete(false);
        autoDownloadTriggeredRef.current = false;
        setError(`${message} Run-all stopped at first failure.`);
      } else {
        setError(message);
      }
    };

    if (isSubmitting || activeTestcaseId) {
      setError("A run is already in progress. Wait for it to complete.");
      return;
    }

    const testcase = testcases.find((entry) => entry.id === testcaseId);
    if (!testcase) {
      failRun("Testcase not found.");
      return;
    }
    const testcaseSubject = String(testcase.subject || subject || "").trim();
    if (!testcaseSubject) {
      failRun("Testcase subject is missing.");
      setTestcases((prev) =>
        prev.map((entry) =>
          entry.id === testcaseId
            ? {
                ...entry,
                status: "failed",
                lastError: "Missing testcase subject",
              }
            : entry,
        ),
      );
      return;
    }
    if (!runnerModelId) {
      failRun("Load and select a model before running a testcase.");
      return;
    }

    const modelMeta = models.find((model) => model.id === runnerModelId);
    if (!modelMeta) {
      failRun("Selected model metadata not found. Reload models.");
      return;
    }

    const { resolved: testcaseDocuments, missing } = resolveTestcaseDocuments({
      refs: testcase.documents,
      attachedDocuments: documents,
    });
    if (missing.length > 0) {
      const sample = missing.slice(0, 3).join(", ");
      failRun(
        `Missing testcase document path(s): ${sample}${missing.length > 3 ? " ..." : ""}. Attach files in Run Configuration before running this testcase.`,
      );
      setTestcases((prev) =>
        prev.map((entry) =>
          entry.id === testcaseId
            ? {
                ...entry,
                status: "failed",
                lastError: `Missing document paths: ${missing.join(" | ")}`,
              }
            : entry,
        ),
      );
      return;
    }

    setTestcases((prev) =>
      prev.map((entry) =>
        entry.id === testcaseId
          ? { ...entry, status: "running", lastError: "" }
          : entry,
      ),
    );
    setActiveTestcaseId(testcaseId);
    const startedAtIso = new Date().toISOString();

    const startedJobId = await startRun({
      subject: testcaseSubject,
      educationLevel: testcase.educationLevel,
      instructions: testcase.instructions,
      numQuizzes: testcase.numQuizzes ?? 5,
      questionsPerQuiz: testcase.questionsPerQuiz ?? 10,
      selectedQuizTypes: testcase.quizTypes,
      timerType: testcase.timerType ?? "default",
      customTimerSeconds: testcase.customTimerSeconds ?? 600,
      documents: testcaseDocuments,
      aiModelId: modelMeta.id,
    });

    if (!startedJobId) {
      setTestcases((prev) =>
        prev.map((entry) =>
          entry.id === testcaseId
            ? {
                ...entry,
                status: "failed",
                lastError: "Failed to start testcase run.",
              }
            : entry,
        ),
      );
      setActiveTestcaseId("");
      setActiveRunContext(null);
      if (queuedTestcaseIds.length > 0) {
        setQueuedTestcaseIds([]);
        setQueueResumeAtMs(null);
        setAutoDownloadAllOnQueueComplete(false);
        autoDownloadTriggeredRef.current = false;
        setRunAllTotalCount(0);
        setRunAllDoneCount(0);
        setError("Failed to start testcase run. Run-all stopped at first failure.");
      }
      return;
    }

    setActiveRunContext({
      testcaseId: testcase.id,
      testcaseTitle: testcase.title,
      testcaseInstructions: testcase.instructions,
      subject: testcase.subject,
      educationLevel: testcase.educationLevel,
      runStartedAtIso: startedAtIso,
      modelId: modelMeta.id,
      modelLabel: modelMeta.label,
      modelProvider: modelMeta.provider,
      modelName: modelMeta.model,
    });
    setTestcases((prev) =>
      prev.map((entry) =>
        entry.id === testcaseId
          ? {
              ...entry,
              lastJobId: startedJobId,
              lastModelId: modelMeta.id,
              lastModelLabel: modelMeta.label,
            }
          : entry,
      ),
    );
  };

  const runAllTestcasesSequentially = (delaySeconds: number) => {
    if (!testcases.length) {
      setError("Import testcases first.");
      return;
    }
    if (!runnerModelId) {
      setError("Select a runner model first.");
      return;
    }
    if (activeTestcaseId || isSubmitting) {
      setError("A run is already in progress.");
      return;
    }
    const normalizedDelaySeconds =
      Number.isFinite(delaySeconds) && delaySeconds >= 0
        ? Math.floor(delaySeconds)
        : 0;
    setQueuedRunDelaySeconds(normalizedDelaySeconds);
    setQueueResumeAtMs(null);
    setAutoDownloadAllOnQueueComplete(true);
    autoDownloadTriggeredRef.current = false;
    setRunAllTotalCount(testcases.length);
    setRunAllDoneCount(0);
    setQueuedTestcaseIds(testcases.map((testcase) => testcase.id));
    setError("");
  };

  const getLatestRecordForTestcase = (testcaseId: string): TestcaseRunRecord | null => {
    const withResolvedInstructions = (
      record: TestcaseRunRecord,
    ): TestcaseRunRecord => {
      const existingInstructions = String(
        (record as unknown as { testcaseInstructions?: string })
          .testcaseInstructions || "",
      ).trim();
      if (existingInstructions.length > 0) return record;

      const testcase = testcases.find((entry) => entry.id === record.testcaseId);
      if (!testcase?.instructions?.trim()) return record;

      return {
        ...record,
        testcaseInstructions: testcase.instructions.trim(),
      };
    };

    const candidates = runRecords
      .filter((record) => record.testcaseId === testcaseId && record.jobStatus === "completed")
      .sort((a, b) => b.runCompletedAt.localeCompare(a.runCompletedAt));
    return candidates[0] ? withResolvedInstructions(candidates[0]) : null;
  };

  const getLatestRunRecords = (): TestcaseRunRecord[] => {
    const withResolvedInstructions = (
      record: TestcaseRunRecord,
    ): TestcaseRunRecord => {
      const existingInstructions = String(
        (record as unknown as { testcaseInstructions?: string })
          .testcaseInstructions || "",
      ).trim();
      if (existingInstructions.length > 0) return record;

      const testcase = testcases.find((entry) => entry.id === record.testcaseId);
      if (!testcase?.instructions?.trim()) return record;

      return {
        ...record,
        testcaseInstructions: testcase.instructions.trim(),
      };
    };

    const latestByKey = new Map<string, TestcaseRunRecord>();
    for (const record of runRecords) {
      const key = `${record.modelId}:${record.testcaseId}`;
      const existing = latestByKey.get(key);
      const normalizedRecord = withResolvedInstructions(record);
      if (!existing || existing.runCompletedAt < normalizedRecord.runCompletedAt) {
        latestByKey.set(key, normalizedRecord);
      }
    }
    return Array.from(latestByKey.values()).sort((a, b) =>
      `${a.modelLabel}-${a.testcaseId}`.localeCompare(`${b.modelLabel}-${b.testcaseId}`),
    );
  };

  const getLatestCompletedRecords = (): TestcaseRunRecord[] =>
    getLatestRunRecords().filter((record) => record.jobStatus === "completed");

  const downloadTestcaseCsv = (testcaseId: string) => {
    const record = getLatestRecordForTestcase(testcaseId);
    if (!record) {
      setError("No completed run found for this testcase.");
      return;
    }
    const fileName = `${buildArtifactBaseName(record)}.csv`;
    exportTestcaseMetricsCsv(record, fileName);
  };

  const downloadTestcaseJson = (testcaseId: string) => {
    const record = getLatestRecordForTestcase(testcaseId);
    if (!record) {
      setError("No completed run found for this testcase.");
      return;
    }
    const fileName = `${buildArtifactBaseName(record)}.json`;
    exportTestcaseJson(record, fileName);
  };

  const downloadTestcaseFinalEvalCsv = (testcaseId: string) => {
    const record = getLatestRecordForTestcase(testcaseId);
    if (!record) {
      setError("No completed run found for this testcase.");
      return;
    }
    const fileName = `${buildArtifactBaseName(record)}_final_evaluation.csv`;
    exportTestcaseFinalEvaluationCsv(record, fileName);
  };

  const downloadTestcasePdf = async (testcaseId: string) => {
    const record = getLatestRecordForTestcase(testcaseId);
    if (!record) {
      setError("No completed run found for this testcase.");
      return;
    }
    const fileName = `${buildArtifactBaseName(record)}.pdf`;
    try {
      await exportQuizPdfForTestcase(record, fileName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to export testcase PDF");
    }
  };

  const downloadCombinedMetricsCsv = () => {
    const latestRecords = getLatestRunRecords();
    if (!latestRecords.length) {
      setError("No testcase runs available.");
      return;
    }
    exportCombinedMetricsCsv(latestRecords, "all_testcases_metrics.csv");
  };

  const downloadCombinedJson = async () => {
    const completedRecords = getLatestCompletedRecords();
    if (!completedRecords.length) {
      setError("No completed testcase runs available.");
      return;
    }

    try {
      const zip = new JSZip();
      for (const record of completedRecords) {
        const fileName = `${buildArtifactBaseName(record)}.json`;
        const { blob } = getTestcaseJsonBlobForTestcase(record, fileName);
        const arrayBuffer = await blob.arrayBuffer();
        zip.file(fileName, arrayBuffer);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "all_testcase_json.zip";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate JSON ZIP");
    }
  };

  const downloadCombinedFinalEvaluationCsv = () => {
    const latestRecords = getLatestCompletedRecords();
    if (!latestRecords.length) {
      setError("No completed testcase runs available.");
      return;
    }
    exportCombinedFinalEvaluationCsv(
      latestRecords,
      "final_evaluation_metrics.csv",
    );
  };

  const downloadAllPdfsZip = async () => {
    const completedRecords = getLatestCompletedRecords();
    if (!completedRecords.length) {
      setError("No completed testcase runs available.");
      return;
    }

    try {
      const zip = new JSZip();
      for (const record of completedRecords) {
        const fileName = `${buildArtifactBaseName(record)}.pdf`;
        const { blob } = await getQuizPdfBlobForTestcase(record, fileName);
        const arrayBuffer = await blob.arrayBuffer();
        zip.file(fileName, arrayBuffer);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "all_testcase_quizzes.zip";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate ZIP");
    }
  };

  const downloadAllDocumentsZip = async () => {
    const latestRecords = getLatestRunRecords();
    const completedRecords = getLatestCompletedRecords();
    if (!completedRecords.length) {
      setError("No completed testcase runs available.");
      return;
    }
    if (!latestRecords.length) {
      setError("No testcase runs available.");
      return;
    }

    try {
      const zip = new JSZip();

      const combinedMetricsCsv = getCombinedMetricsCsvBlob(
        latestRecords,
        "all_testcases_metrics.csv",
      );
      if (combinedMetricsCsv) {
        const csvBuffer = await combinedMetricsCsv.blob.arrayBuffer();
        zip.file(`csv/${combinedMetricsCsv.fileName}`, csvBuffer);
      }

      const combinedFinalCsv = getCombinedFinalEvaluationCsvBlob(
        completedRecords,
        "final_evaluation_metrics.csv",
      );
      if (combinedFinalCsv) {
        const finalCsvBuffer = await combinedFinalCsv.blob.arrayBuffer();
        zip.file(`csv/${combinedFinalCsv.fileName}`, finalCsvBuffer);
      }

      for (const record of completedRecords) {
        const jsonFileName = `${buildArtifactBaseName(record)}.json`;
        const { blob: jsonBlob, fileName } = getTestcaseJsonBlobForTestcase(
          record,
          jsonFileName,
        );
        const jsonBuffer = await jsonBlob.arrayBuffer();
        zip.file(`all_testcase_json/${fileName}`, jsonBuffer);
      }

      for (const record of completedRecords) {
        const pdfFileName = `${buildArtifactBaseName(record)}.pdf`;
        const { blob: pdfBlob, fileName } = await getQuizPdfBlobForTestcase(
          record,
          pdfFileName,
        );
        const pdfBuffer = await pdfBlob.arrayBuffer();
        zip.file(`all_testcase_pdf/${fileName}`, pdfBuffer);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlobFile(zipBlob, "all_testcase_documents.zip");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to generate documents ZIP",
      );
    }
  };

  useEffect(() => {
    if (!autoDownloadAllOnQueueComplete) return;
    if (autoDownloadTriggeredRef.current) return;

    const queueFinished =
      queuedTestcaseIds.length === 0 && !activeTestcaseId && !isSubmitting;
    if (!queueFinished) return;

    const hasCompletedRuns = runRecords.some(
      (record) => record.jobStatus === "completed",
    );
    setAutoDownloadAllOnQueueComplete(false);
    setRunAllTotalCount(0);
    setRunAllDoneCount(0);
    if (!hasCompletedRuns) return;

    autoDownloadTriggeredRef.current = true;
    void downloadAllDocumentsZip();
  }, [
    autoDownloadAllOnQueueComplete,
    queuedTestcaseIds,
    activeTestcaseId,
    isSubmitting,
    runRecords,
  ]);

  useEffect(() => {
    if (!queuedTestcaseIds.length) return;
    if (activeTestcaseId || isSubmitting) return;
    if (queueResumeAtMs !== null) {
      const waitMs = queueResumeAtMs - Date.now();
      if (waitMs > 0) {
        const timeout = window.setTimeout(() => setQueueResumeAtMs(null), waitMs);
        return () => window.clearTimeout(timeout);
      }
      setQueueResumeAtMs(null);
    }

    const [nextTestcaseId, ...remaining] = queuedTestcaseIds;
    setQueuedTestcaseIds(remaining);
    void runImportedTestcase(nextTestcaseId);
  }, [queuedTestcaseIds, activeTestcaseId, isSubmitting, queueResumeAtMs]);

  const clearImportedTestcases = () => {
    if (activeTestcaseId || isSubmitting || queuedTestcaseIds.length > 0) {
      setError("Cannot clear testcases while a run is in progress.");
      return;
    }
    setTestcases([]);
    setRunRecords([]);
    setQueuedTestcaseIds([]);
    setQueueResumeAtMs(null);
    setAutoDownloadAllOnQueueComplete(false);
    autoDownloadTriggeredRef.current = false;
    setRunAllTotalCount(0);
    setRunAllDoneCount(0);
    setActiveRunContext(null);
    setError("");
  };

  const exportPdf = () => {
    const previousTitle = window.document.title;
    window.document.title = jobId ? `llm-eval-${jobId}` : "llm-eval-run";
    window.print();
    setTimeout(() => {
      window.document.title = previousTitle;
    }, 500);
  };

  const exportMetricsCsv = () => {
    if (!job || !metrics) {
      setError("Run metrics are not available for CSV export yet.");
      return;
    }

    const selectedModelMeta =
      models.find((model) => model.id === selectedModel) || null;
    const planning = job.analytics?.planning;
    const quizzes = Array.isArray(job.results?.quizzes) ? job.results.quizzes : [];
    const documentNames = documents.map((document) => document.file.name).join(" | ");
    const documentTypes = documents
      .map((document) => document.documentType)
      .join(" | ");

    const headers = [
      "exported_at",
      "job_id",
      "job_status",
      "model_id",
      "model_label",
      "model_provider",
      "model_name",
      "subject",
      "education_level",
      "quiz_types",
      "num_quizzes_requested",
      "questions_per_quiz",
      "timer_type",
      "custom_timer_seconds",
      "document_count",
      "document_names",
      "document_types",
      "completion_rate_pct",
      "run_successful_quizzes",
      "run_failed_quizzes",
      "planning_success",
      "planning_fallback_used",
      "planning_plan_item_count",
      "planning_provider",
      "planning_model",
      "planning_latency_ms",
      "planning_input_tokens",
      "planning_output_tokens",
      "planning_total_tokens",
      "overall_total_tokens",
      "planning_error",
      "generation_attempt_count",
      "generation_successful_attempts",
      "generation_retry_count",
      "generation_latency_ms",
      "generation_input_tokens",
      "generation_output_tokens",
      "generation_total_tokens",
      "planning_estimated_cost_usd",
      "generation_estimated_cost_usd",
      "overall_estimated_cost_usd",
      "has_unpriced_calls",
      "total_llm_latency_ms",
      "wall_clock_ms",
    ];

    const values = [
      new Date().toISOString(),
      job.id || jobId,
      job.status,
      selectedModel || "",
      selectedModelMeta?.label || "",
      selectedModelMeta?.provider || "",
      selectedModelMeta?.model || "",
      subject,
      educationLevel,
      selectedQuizTypes.join("|"),
      String(numQuizzes),
      String(questionsPerQuiz),
      timerType,
      timerType === "custom" ? String(customTimerSeconds) : "",
      String(documents.length),
      documentNames,
      documentTypes,
      metrics.completionRate.toFixed(2),
      String(job.results?.successful ?? quizzes.length),
      String(job.results?.failed ?? 0),
      metrics.planningSuccess === null ? "" : String(metrics.planningSuccess),
      metrics.planningFallbackUsed === null
        ? ""
        : String(metrics.planningFallbackUsed),
      metrics.planningPlanItemCount === null
        ? ""
        : String(metrics.planningPlanItemCount),
      planning?.provider || "",
      planning?.model || "",
      metrics.planningLatencyMs === null ? "" : String(metrics.planningLatencyMs),
      metrics.planningInputTokens === null ? "" : String(metrics.planningInputTokens),
      metrics.planningOutputTokens === null
        ? ""
        : String(metrics.planningOutputTokens),
      metrics.planningTotalTokens === null ? "" : String(metrics.planningTotalTokens),
      metrics.overallTotalTokens === null ? "" : String(metrics.overallTotalTokens),
      planning?.error || "",
      metrics.generationAttemptCount === null
        ? ""
        : String(metrics.generationAttemptCount),
      metrics.generationSuccessfulAttempts === null
        ? ""
        : String(metrics.generationSuccessfulAttempts),
      String(metrics.retryCount),
      metrics.generationLatencyMs === null
        ? ""
        : String(metrics.generationLatencyMs),
      metrics.generationInputTokens === null
        ? ""
        : String(metrics.generationInputTokens),
      metrics.generationOutputTokens === null
        ? ""
        : String(metrics.generationOutputTokens),
      metrics.generationTotalTokens === null
        ? ""
        : String(metrics.generationTotalTokens),
      metrics.planningEstimatedCostUsd === null
        ? ""
        : metrics.planningEstimatedCostUsd.toFixed(6),
      metrics.generationEstimatedCostUsd === null
        ? ""
        : metrics.generationEstimatedCostUsd.toFixed(6),
      metrics.overallEstimatedCostUsd === null
        ? ""
        : metrics.overallEstimatedCostUsd.toFixed(6),
      String(metrics.hasUnpricedCalls),
      metrics.totalLlmLatencyMs === null ? "" : String(metrics.totalLlmLatencyMs),
      metrics.wallClockMs === null ? "" : String(metrics.wallClockMs),
    ];

    const escapeCsv = (value: string) => `"${value.replace(/"/g, "\"\"")}"`;
    const csv = [
      headers.map(escapeCsv).join(","),
      values.map((value) => escapeCsv(String(value))).join(","),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeJobId = String(job.id || jobId || "run").replace(/[^a-zA-Z0-9_-]/g, "_");
    anchor.href = url;
    anchor.download = `llm-eval-metrics-${safeJobId}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container">
      <header className="no-print">
        <h1 className="page-title">LLM Evaluation Runner</h1>
      </header>

      <AuthSettingsCard
        userServiceUrl={userServiceUrl}
        onUserServiceUrlChange={setUserServiceUrl}
        teacherIdentifier={teacherIdentifier}
        onTeacherIdentifierChange={setTeacherIdentifier}
        teacherPassword={teacherPassword}
        onTeacherPasswordChange={setTeacherPassword}
        aiServiceUrl={aiServiceUrl}
        onAiServiceUrlChange={setAiServiceUrl}
        accessToken={accessToken}
        onAccessTokenChange={setAccessToken}
        analyticsSecret={analyticsSecret}
        onAnalyticsSecretChange={setAnalyticsSecret}
        onSignInAndFetchToken={() => {
          void signInAndFetchToken();
        }}
        onLoadModels={() => {
          void loadModels();
        }}
        isSigningIn={isSigningIn}
        loadingModels={loadingModels}
        authStatus={authStatus}
        models={models}
      />

      <RunConfigurationCard
        subject={subject}
        onSubjectChange={setSubject}
        educationLevel={educationLevel}
        onEducationLevelChange={setEducationLevel}
        numQuizzes={numQuizzes}
        onNumQuizzesChange={setNumQuizzes}
        questionsPerQuiz={questionsPerQuiz}
        onQuestionsPerQuizChange={setQuestionsPerQuiz}
        selectedModel={selectedModel}
        onSelectedModelChange={setSelectedModel}
        models={models}
        selectedQuizTypes={selectedQuizTypes}
        onToggleQuizType={toggleQuizType}
        timerType={timerType}
        onTimerTypeChange={setTimerType}
        customTimerSeconds={customTimerSeconds}
        onCustomTimerSecondsChange={setCustomTimerSeconds}
        documents={documents}
        onAddDocuments={addDocuments}
        onUpdateDocumentType={updateDocumentType}
        onRemoveDocument={removeDocument}
        instructions={instructions}
        onInstructionsChange={setInstructions}
        onStartRun={() => {
          void startRun();
        }}
        isSubmitting={isSubmitting}
        jobId={jobId}
        error={error}
      />

      <TestcaseRunnerCard
        testcases={testcases}
        activeTestcaseId={activeTestcaseId}
        isRunningQueue={
          queuedTestcaseIds.length > 0 || autoDownloadAllOnQueueComplete
        }
        runAllTotalCount={runAllTotalCount}
        runAllDoneCount={runAllDoneCount}
        runnerModelId={runnerModelId}
        models={models}
        onRunnerModelChange={setRunnerModelId}
        onImportFile={(file) => {
          void importTestcaseFile(file);
        }}
        onRunTestcase={(testcaseId) => {
          void runImportedTestcase(testcaseId);
        }}
        onRunAllTestcases={runAllTestcasesSequentially}
        onDownloadTestcaseCsv={downloadTestcaseCsv}
        onDownloadTestcaseJson={downloadTestcaseJson}
        onDownloadTestcaseFinalEvalCsv={downloadTestcaseFinalEvalCsv}
        onDownloadTestcasePdf={(testcaseId) => {
          void downloadTestcasePdf(testcaseId);
        }}
        onDownloadCombinedCsv={downloadCombinedMetricsCsv}
        onDownloadCombinedJson={() => {
          void downloadCombinedJson();
        }}
        onDownloadCombinedFinalEvalCsv={downloadCombinedFinalEvaluationCsv}
        onDownloadAllPdfsZip={() => {
          void downloadAllPdfsZip();
        }}
        onDownloadAllDocumentsZip={() => {
          void downloadAllDocumentsZip();
        }}
        onClearTestcases={clearImportedTestcases}
        onUseTestcaseInForm={applyTestcaseToForm}
      />

      <RunResultsCard
        job={job}
        metrics={metrics}
        onExportPdf={exportPdf}
        onExportCsv={exportMetricsCsv}
      />
    </div>
  );
}
