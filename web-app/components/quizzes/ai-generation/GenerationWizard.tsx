"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/buttons/Button";
import TextInput from "@/components/ui/text-inputs/TextInput";
import TextArea from "@/components/ui/text-inputs/TextArea";
import Select from "@/components/ui/selectors/select/Select";
import { Icon } from "@iconify/react";
import { FilterMeta } from "@/services/quiz/types/quiz-table-types";
import {
  AvailableAIModel,
  GenerationQuotaStatus,
  startGeneration,
} from "@/services/ai-generation/ai-generation-actions";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { useMetaAdders } from "@/services/quiz/quiz-form-helpers/hooks/useMetaAdders";
import FileUploadZone, {
  UploadDocumentType,
  UploadedReferenceDocument,
} from "./components/FileUploadZone";
import DocumentTypeSelectionModal from "./components/DocumentTypeSelectionModal";

interface GenerationWizardProps {
  meta: FilterMeta;
  availableModels: AvailableAIModel[];
  defaultModelId?: string;
  quota?: GenerationQuotaStatus;
}

const MAX_DOCUMENT_SIZE_MB = 20;
const MAX_DOCUMENT_SIZE_BYTES = MAX_DOCUMENT_SIZE_MB * 1024 * 1024;
const FALLBACK_MAX_QUIZZES_PER_GENERATION = 20;
const FALLBACK_MIN_QUESTIONS_PER_QUIZ = 5;
const FALLBACK_MAX_QUESTIONS_PER_QUIZ = 20;

function guessDocumentType(file: File): UploadDocumentType {
  const name = file.name.toLowerCase();
  if (name.includes("syllabus") || name.includes("curriculum")) {
    return "syllabus";
  }
  if (
    name.includes("past") ||
    name.includes("paper") ||
    name.includes("question") ||
    name.includes("worksheet") ||
    name.includes("exam") ||
    name.includes("test")
  ) {
    return "question-bank";
  }
  if (
    name.includes("textbook") ||
    name.includes("lesson") ||
    name.includes("chapter") ||
    name.includes("notes") ||
    name.includes("content")
  ) {
    return "subject-content";
  }
  return "other";
}

export default function GenerationWizard({
  meta,
  availableModels,
  defaultModelId,
  quota,
}: GenerationWizardProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const { addSubject } = useMetaAdders();

  const [documents, setDocuments] = useState<UploadedReferenceDocument[]>([]);
  const [pendingDocumentQueue, setPendingDocumentQueue] = useState<File[]>([]);
  const [activeDocument, setActiveDocument] = useState<File | null>(null);
  const [activeDocumentType, setActiveDocumentType] =
    useState<UploadDocumentType>("other");
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state - instructions are now required, file is optional
  const [instructions, setInstructions] = useState("");
  const [numQuizzes, setNumQuizzes] = useState(
    quota?.limits?.maxQuizzesPerGeneration ??
      FALLBACK_MAX_QUIZZES_PER_GENERATION,
  );
  const [hasCustomizedNumQuizzes, setHasCustomizedNumQuizzes] =
    useState(false);
  const [educationLevel, setEducationLevel] = useState<string>("primary-1");
  const [questionsPerQuiz, setQuestionsPerQuiz] = useState(10);
  const [selectedQuizTypes, setSelectedQuizTypes] = useState<string[]>([
    "basic",
    "rapid",
    "crossword",
    "true-false",
  ]);
  const [selectedModel, setSelectedModel] = useState(
    defaultModelId || availableModels[0]?.id || "",
  );
  const [subject, setSubject] = useState("");
  const [timerType, setTimerType] = useState<"default" | "custom" | "none">(
    "default",
  );
  const [customTimer, setCustomTimer] = useState(600);

  const toggleQuizType = (type: string) => {
    setSelectedQuizTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const hasPendingDocumentSelection =
    !!activeDocument || pendingDocumentQueue.length > 0;
  const quotaEnabled = !!quota?.enabled;
  const quotaExhausted = !!quota?.enabled && !!quota?.exhausted;
  const maxQuizzesPerGeneration =
    quota?.limits?.maxQuizzesPerGeneration ??
    FALLBACK_MAX_QUIZZES_PER_GENERATION;
  const minQuestionsPerQuiz =
    quota?.limits?.minQuestionsPerQuiz ?? FALLBACK_MIN_QUESTIONS_PER_QUIZ;
  const maxQuestionsPerQuiz =
    quota?.limits?.maxQuestionsPerQuiz ?? FALLBACK_MAX_QUESTIONS_PER_QUIZ;

  const queueFilesForTyping = (incoming: File[]) => {
    if (incoming.length === 0) return;
    setPendingDocumentQueue((prev) => [...prev, ...incoming]);
  };

  const finalizeActiveDocument = () => {
    if (!activeDocument) return;
    setDocuments((prev) => [
      ...prev,
      { file: activeDocument, documentType: activeDocumentType },
    ]);
    setActiveDocument(null);
    setActiveDocumentType("other");
  };

  const skipActiveDocument = () => {
    if (activeDocument) {
      showToast({
        title: "File skipped",
        description: `${activeDocument.name} was not added.`,
        variant: "warning",
      });
    }
    setActiveDocument(null);
    setActiveDocumentType("other");
  };

  useEffect(() => {
    if (activeDocument || pendingDocumentQueue.length === 0) return;
    const [next, ...rest] = pendingDocumentQueue;
    setPendingDocumentQueue(rest);
    if (next) {
      setActiveDocument(next);
      setActiveDocumentType(guessDocumentType(next));
    }
  }, [activeDocument, pendingDocumentQueue]);

  useEffect(() => {
    setNumQuizzes((current) => {
      if (!hasCustomizedNumQuizzes) {
        return maxQuizzesPerGeneration;
      }

      return Math.min(Math.max(1, current), maxQuizzesPerGeneration);
    });
  }, [hasCustomizedNumQuizzes, maxQuizzesPerGeneration]);

  useEffect(() => {
    setQuestionsPerQuiz((current) =>
      Math.min(
        Math.max(minQuestionsPerQuiz, current),
        maxQuestionsPerQuiz,
      ),
    );
  }, [maxQuestionsPerQuiz, minQuestionsPerQuiz]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      handleFilesSelect(droppedFiles);
    }
  };

  const handleFilesSelect = (selectedFiles: File[]) => {
    const validTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];

    const validFiles: File[] = [];

    for (const file of selectedFiles) {
      if (!validTypes.includes(file.type)) {
        showToast({
          title: "Invalid file type",
          description: `${file.name} is not a valid file type. Only PDF, DOCX, and TXT files are allowed.`,
          variant: "error",
        });
        continue;
      }

      if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
        showToast({
          title: "File too large",
          description: `${file.name} exceeds ${MAX_DOCUMENT_SIZE_MB}MB limit`,
          variant: "error",
        });
        continue;
      }

      validFiles.push(file);
    }

    const currentlyTrackedCount =
      documents.length + pendingDocumentQueue.length + (activeDocument ? 1 : 0);
    const remainingSlots = Math.max(0, 5 - currentlyTrackedCount);
    const acceptedFiles = validFiles.slice(0, remainingSlots);

    if (acceptedFiles.length < validFiles.length) {
      showToast({
        title: "Maximum files reached",
        description: "You can upload up to 5 files",
        variant: "warning",
      });
    }

    queueFilesForTyping(acceptedFiles);
  };

  const removeFile = (index: number) => {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!instructions.trim()) {
      showToast({
        title: "Instructions required",
        description: "Please provide instructions for quiz generation",
        variant: "error",
      });
      return;
    }

    if (!selectedModel) {
      showToast({
        title: "Model required",
        description: "Please select an AI model for generation",
        variant: "error",
      });
      return;
    }

    if (quotaExhausted) {
      showToast({
        title: "Generation quota reached",
        description:
          "You have used all AI generation attempts allocated for this testing account.",
        variant: "error",
      });
      return;
    }

    if (hasPendingDocumentSelection) {
      showToast({
        title: "Complete document setup",
        description:
          "Please finish selecting a document type for all uploaded files.",
        variant: "warning",
      });
      return;
    }

    // Subject is required.
    if (!subject.trim()) {
      showToast({
        title: "Subject required",
        description: "Please select a subject for the quiz",
        variant: "error",
      });
      return;
    }

    if (selectedQuizTypes.length === 0) {
      showToast({
        title: "Quiz type required",
        description: "Please select at least one quiz type to generate",
        variant: "error",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();

      // Add all files (up to 5)
      documents.forEach((document) => {
        formData.append("documents", document.file);
        formData.append("documentTypes", document.documentType);
      });

      // Instructions and subject are required; topic is AI-generated per quiz.
      formData.append("instructions", instructions);
      formData.append("numQuizzes", String(numQuizzes));
      formData.append("educationLevel", educationLevel);
      formData.append("questionsPerQuiz", String(questionsPerQuiz));
      formData.append("aiModel", selectedModel);
      formData.append("subject", subject);
      selectedQuizTypes.forEach((type) => formData.append("quizTypes", type));

      formData.append(
        "timerSettings",
        JSON.stringify({
          type: timerType,
          defaultSeconds: timerType === "custom" ? customTimer : undefined,
        }),
      );

      const result = await startGeneration(formData);

      if (!result.ok || !result.jobId) {
        showToast({
          title: "Generation failed",
          description: result.message || "Failed to start quiz generation",
          variant: "error",
        });
        return;
      }

      showToast({
        title: "Generation started",
        description: "Your quizzes are being generated. Redirecting...",
        variant: "success",
      });

      setTimeout(() => {
        router.push(`/quizzes/ai-generate/review/${result.jobId}`);
      }, 1000);
    } catch (error) {
      console.error("Submit error:", error);
      showToast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {/* Configuration Section */}
      <div
        className="bg-[var(--color-bg2)] rounded-xl p-6 border border-[var(--color-bg4)] space-y-6"
        style={{ boxShadow: "var(--drop-shadow-sm)" }}
      >
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Generation Settings
        </h2>

        {quotaEnabled ? (
          <div className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg1)] px-4 py-3">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              AI generation quota
            </p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              {quotaExhausted
                ? `Quota exhausted. You have used ${quota?.generationsUsed ?? 0} of ${quota?.maxGenerations ?? 0} allowed generation jobs.`
                : `${quota?.generationsRemaining ?? 0} of ${quota?.maxGenerations ?? 0} generation job(s) remaining for this account.`}
            </p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-2">
              Current limits: up to {maxQuizzesPerGeneration} quiz(es) per
              generation and up to {maxQuestionsPerQuiz} question(s) per quiz.
            </p>
          </div>
        ) : null}

        {/* Model Selection */}
        <div>
          <Select
            id="aiModel"
            name="aiModel"
            label="AI Model"
            labelClassName="text-sm text-[var(--color-text-primary)]"
            placeholder="Select an AI model"
            options={availableModels.map((model) => ({
              label: model.label,
              value: model.id,
            }))}
            value={selectedModel}
            onChange={(value) => setSelectedModel(String(value))}
            required
            searchable
            className="min-w-0"
          />
          <p className="text-xs text-[var(--color-text-secondary)] mt-2">
            {availableModels.find((m) => m.id === selectedModel)?.description ||
              "Choose the model to use for this generation job."}
          </p>
        </div>

        {/* Number of Quizzes */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
            Number of Quizzes: {numQuizzes}
          </label>
          <input
            type="range"
            min="1"
            max={String(maxQuizzesPerGeneration)}
            value={numQuizzes}
            onChange={(e) => {
              setHasCustomizedNumQuizzes(true);
              setNumQuizzes(Number(e.target.value));
            }}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-[var(--color-text-secondary)] mt-1">
            <span>1</span>
            <span>{maxQuizzesPerGeneration}</span>
          </div>
        </div>

        {/* Education Level - Singapore Primary School */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
            Education Level <span className="text-[var(--color-error)]">*</span>
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: "primary-1", label: "Primary 1" },
              { value: "primary-2", label: "Primary 2" },
              { value: "primary-3", label: "Primary 3" },
              { value: "primary-4", label: "Primary 4" },
              { value: "primary-5", label: "Primary 5" },
              { value: "primary-6", label: "Primary 6" },
            ].map((level) => (
              <button
                key={level.value}
                type="button"
                onClick={() => setEducationLevel(level.value)}
                className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                  educationLevel === level.value
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                    : "border-[var(--color-bg4)] text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/50"
                }`}
              >
                {level.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] mt-2">
            The AI will generate age-appropriate questions for the selected
            level
          </p>
        </div>

        {/* Questions Per Quiz */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
            Questions Per Quiz: {questionsPerQuiz}
          </label>
          <input
            type="range"
            min={String(minQuestionsPerQuiz)}
            max={String(maxQuestionsPerQuiz)}
            step="1"
            value={questionsPerQuiz}
            onChange={(e) => setQuestionsPerQuiz(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-[var(--color-text-secondary)] mt-1">
            <span>{minQuestionsPerQuiz}</span>
            <span>{maxQuestionsPerQuiz}</span>
          </div>
        </div>

        {/* Quiz Types + Subject */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Quiz Types <span className="text-[var(--color-error)]">*</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {[
                { value: "basic", label: "Basic" },
                { value: "rapid", label: "Rapid" },
                { value: "crossword", label: "Crossword" },
                { value: "true-false", label: "True/False" },
              ].map((option) => {
                const selected = selectedQuizTypes.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleQuizType(option.value)}
                    className={`px-4 py-2 rounded-lg border-2 transition-all text-sm font-medium ${
                      selected
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                        : "border-[var(--color-bg4)] text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/50"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Select
              id="subject"
              name="subject"
              label="Subject"
              labelClassName="text-sm text-[var(--color-text-primary)]"
              placeholder="Select A Subject"
              options={meta.subjects.map((s) => ({
                label: s.label,
                value: s.value,
                colorHex: s.colorHex,
              }))}
              required
              handleAdd={addSubject}
              value={subject}
              onChange={(val) => setSubject(val as string)}
              colorMode="always"
              searchable
              className="min-w-0"
            />
          </div>
        </div>

        {/* Timer Settings */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
            Timer Settings
          </label>
          <div className="flex gap-3 mb-3">
            {[
              { value: "default", label: "Default" },
              { value: "custom", label: "Custom" },
              { value: "none", label: "No Timer" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setTimerType(option.value as "default" | "custom" | "none")
                }
                className={`px-4 py-2 rounded-lg border-2 transition-all text-sm font-medium ${
                  timerType === option.value
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                    : "border-[var(--color-bg4)] text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {timerType === "custom" && (
            <TextInput
              id="customTimer"
              label={`Time Limit (seconds): ${customTimer}`}
              type="number"
              value={String(customTimer)}
              onValueChange={(val) => setCustomTimer(Number(val))}
              min={60}
              max={3600}
              step={60}
            />
          )}
        </div>
      </div>

      {/* Instructions Section - Now Primary and Required */}
      <div
        className="bg-[var(--color-bg2)] rounded-xl p-6 border border-[var(--color-bg4)]"
        style={{ boxShadow: "var(--drop-shadow-sm)" }}
      >
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
          Quiz Generation Instructions{" "}
          <span className="text-[var(--color-error)]">*</span>
        </h2>
        <TextArea
          value={instructions}
          onChange={setInstructions}
          placeholder="Describe what you want the AI to generate. For example: 'Create quizzes about fractions and decimals for primary school students' or 'Generate math quizzes covering addition and subtraction with word problems'"
          minHeight={160}
          required={true}
        />
        <p className="text-xs text-[var(--color-text-secondary)] mt-2">
          Provide clear instructions about the topics, concepts, and any
          specific requirements for the quizzes.
        </p>
      </div>

      {/* File Upload Section - Now Optional, Up to 5 Files */}
      <div
        className="bg-[var(--color-bg2)] rounded-xl p-6 border border-[var(--color-bg4)]"
        style={{ boxShadow: "var(--drop-shadow-sm)" }}
      >
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
          Reference Documents (Optional - Up to 5 Files)
        </h2>

        <FileUploadZone
          documents={documents}
          maxFileSizeMb={MAX_DOCUMENT_SIZE_MB}
          isDragging={isDragging}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onFileSelect={handleFilesSelect}
          onRemoveFile={removeFile}
        />
      </div>

      {/* Submit Button */}
      <div className="flex justify-end gap-3">
        {hasPendingDocumentSelection && (
          <p className="mr-auto text-xs text-[var(--color-text-secondary)] self-center">
            Finish classifying uploaded documents before generating quizzes.
          </p>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            !instructions.trim() ||
            !selectedModel ||
            !subject.trim() ||
            selectedQuizTypes.length === 0 ||
            isSubmitting ||
            hasPendingDocumentSelection ||
            quotaExhausted
          }
        >
          {quotaExhausted ? (
            <>
              <Icon icon="mdi:lock" className="w-4 h-4 mr-2" />
              Generation Quota Reached
            </>
          ) : isSubmitting ? (
            <>
              <Icon icon="mdi:loading" className="w-4 h-4 animate-spin mr-2" />
              Generating...
            </>
          ) : (
            <>
              <Icon icon="mdi:sparkles" className="w-4 h-4 mr-2" />
              Generate Quizzes
            </>
          )}
        </Button>
      </div>

      <DocumentTypeSelectionModal
        open={!!activeDocument}
        file={activeDocument}
        value={activeDocumentType}
        onChange={setActiveDocumentType}
        onConfirm={finalizeActiveDocument}
        onSkip={skipActiveDocument}
      />
    </form>
  );
}
