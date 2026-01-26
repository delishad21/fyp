"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/buttons/Button";
import TextInput from "@/components/ui/text-inputs/TextInput";
import TextArea from "@/components/ui/text-inputs/TextArea";
import Select from "@/components/ui/selectors/select/Select";
import { Icon } from "@iconify/react";
import { FilterMeta } from "@/services/quiz/types/quiz-table-types";
import { startGeneration } from "@/services/ai-generation/ai-generation-actions";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { useMetaAdders } from "@/services/quiz/quiz-form-helpers/hooks/useMetaAdders";
import FileUploadZone from "./components/FileUploadZone";

interface GenerationWizardProps {
  meta: FilterMeta;
}

export default function GenerationWizard({ meta }: GenerationWizardProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const { addSubject, addTopic } = useMetaAdders();

  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state - instructions are now required, file is optional
  const [instructions, setInstructions] = useState("");
  const [numQuizzes, setNumQuizzes] = useState(1);
  const [educationLevel, setEducationLevel] = useState<string>("primary-1");
  const [questionsPerQuiz, setQuestionsPerQuiz] = useState(10);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [timerType, setTimerType] = useState<"default" | "custom" | "none">(
    "default",
  );
  const [customTimer, setCustomTimer] = useState(600);

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

      if (file.size > 10 * 1024 * 1024) {
        showToast({
          title: "File too large",
          description: `${file.name} exceeds 10MB limit`,
          variant: "error",
        });
        continue;
      }

      validFiles.push(file);
    }

    // Limit to 5 files total
    const newFiles = [...files, ...validFiles].slice(0, 5);
    setFiles(newFiles);

    if (newFiles.length === 5 && validFiles.length > 0) {
      showToast({
        title: "Maximum files reached",
        description: "You can upload up to 5 files",
        variant: "warning",
      });
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
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

    // Subject and topic are now required
    if (!subject.trim()) {
      showToast({
        title: "Subject required",
        description: "Please select a subject for the quiz",
        variant: "error",
      });
      return;
    }

    if (!topic.trim()) {
      showToast({
        title: "Topic required",
        description: "Please select a topic for the quiz",
        variant: "error",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();

      // Add all files (up to 5)
      files.forEach((file) => {
        formData.append("documents", file);
      });

      // Instructions, subject, and topic are required
      formData.append("instructions", instructions);
      formData.append("numQuizzes", String(numQuizzes));
      formData.append("educationLevel", educationLevel);
      formData.append("questionsPerQuiz", String(questionsPerQuiz));
      formData.append("subject", subject);
      formData.append("topic", topic);

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
          files={files}
          isDragging={isDragging}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onFileSelect={handleFilesSelect}
          onRemoveFile={removeFile}
        />
      </div>

      {/* Configuration Section */}
      <div
        className="bg-[var(--color-bg2)] rounded-xl p-6 border border-[var(--color-bg4)] space-y-6"
        style={{ boxShadow: "var(--drop-shadow-sm)" }}
      >
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Generation Settings
        </h2>

        {/* Number of Quizzes */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
            Number of Quizzes: {numQuizzes}
          </label>
          <input
            type="range"
            min="1"
            max="20"
            value={numQuizzes}
            onChange={(e) => setNumQuizzes(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-[var(--color-text-secondary)] mt-1">
            <span>1</span>
            <span>20</span>
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
            min="5"
            max="20"
            step="5"
            value={questionsPerQuiz}
            onChange={(e) => setQuestionsPerQuiz(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-[var(--color-text-secondary)] mt-1">
            <span>5</span>
            <span>10</span>
            <span>15</span>
            <span>20</span>
          </div>
        </div>

        {/* Subject and Topic */}
        <div className="grid grid-cols-2 gap-4">
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
          <Select
            id="topic"
            name="topic"
            label="Topic"
            labelClassName="text-sm text-[var(--color-text-primary)]"
            placeholder="Select A Topic"
            options={meta.topics.map((t) => ({
              label: t.label,
              value: t.value,
            }))}
            required
            handleAdd={addTopic}
            value={topic}
            onChange={(val) => setTopic(val as string)}
            searchable
            className="min-w-0"
          />
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

      {/* Submit Button */}
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!instructions.trim() || isSubmitting}>
          {isSubmitting ? (
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
    </form>
  );
}
