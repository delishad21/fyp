"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/buttons/Button";
import { Icon } from "@iconify/react";
import { useToast } from "@/components/ui/toast/ToastProvider";
import {
  getGenerationStatus,
  approveQuizzes,
  deleteGenerationJob,
} from "@/services/ai-generation/ai-generation-actions";
import type { DraftQuiz } from "@/services/ai-generation/ai-generation-actions";
import type { FilterMeta } from "@/services/quiz/types/quiz-table-types";
import BasicOrRapidQuizPreview from "@/components/quizzes/quiz-view/BasicOrRapidQuizPreview";
import CrosswordQuizPreview from "@/components/quizzes/quiz-view/CrosswordQuizPreview";
import ProcessingState from "./components/ProcessingState";
import QuizListItem from "./components/QuizListItem";

interface GeneratedQuizReviewProps {
  job: {
    id: string;
    status: "pending" | "processing" | "completed" | "failed";
    progress: {
      current: number;
      total: number;
      quizzes?: Array<{
        tempId: string;
        quizNumber: number;
        status: "pending" | "generating" | "completed" | "failed";
        error?: string;
        retryCount: number;
      }>;
    };
    results?: {
      total: number;
      successful: number;
      failed: number;
      quizzes: DraftQuiz[];
    };
    error?: string;
  };
  meta: FilterMeta;
}

export default function GeneratedQuizReview({ job }: GeneratedQuizReviewProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const jobId = job.id;
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(job.error || null);
  const [status, setStatus] = useState(job.status);
  const [progress, setProgress] = useState(job.progress.current);
  const [total, setTotal] = useState(job.progress.total);
  const [quizProgress, setQuizProgress] = useState<
    Array<{
      tempId: string;
      quizNumber: number;
      status: "pending" | "generating" | "completed" | "failed";
      error?: string;
      retryCount: number;
    }>
  >(job.progress.quizzes || []);
  const [quizzes, setQuizzes] = useState<DraftQuiz[]>(
    job.results?.quizzes || [],
  );
  const [selectedQuizzes, setSelectedQuizzes] = useState<Set<string>>(
    new Set(),
  );
  const [viewingQuiz, setViewingQuiz] = useState<string | null>(
    quizzes.length > 0 ? quizzes[0].tempId : null,
  );

  // Poll for status updates
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchStatus = async () => {
      const result = await getGenerationStatus(jobId);

      if (!result.ok || !result.job) {
        setError(result.message || "Failed to fetch job status");
        return;
      }

      const fetchedJob = result.job;
      setStatus(fetchedJob.status);
      setProgress(fetchedJob.progress.current);
      setTotal(fetchedJob.progress.total);
      setQuizProgress(
        (fetchedJob.progress as typeof job.progress).quizzes || [],
      );
      setQuizzes(fetchedJob.results?.quizzes || []);

      if (fetchedJob.status === "failed") {
        setError(fetchedJob.error || "Generation failed");
      }

      // Stop polling when complete or failed
      if (fetchedJob.status === "completed" || fetchedJob.status === "failed") {
        if (interval) clearInterval(interval);
      }
    };

    // Only poll if still processing
    if (status === "processing" || status === "pending") {
      interval = setInterval(fetchStatus, 2000);
      return () => {
        if (interval) clearInterval(interval);
      };
    }
  }, [jobId, status, job]);

  const toggleSelectAll = () => {
    if (selectedQuizzes.size === quizzes.length) {
      setSelectedQuizzes(new Set());
    } else {
      setSelectedQuizzes(new Set(quizzes.map((q) => q.tempId)));
    }
  };

  const toggleSelectQuiz = (quizId: string) => {
    const newSelected = new Set(selectedQuizzes);
    if (newSelected.has(quizId)) {
      newSelected.delete(quizId);
    } else {
      newSelected.add(quizId);
    }
    setSelectedQuizzes(newSelected);
  };

  const handleApprove = async () => {
    if (selectedQuizzes.size === 0) {
      showToast({
        title: "No quizzes selected",
        description: "Please select at least one quiz to approve",
        variant: "error",
      });
      return;
    }

    setProcessing(true);

    const result = await approveQuizzes(jobId, Array.from(selectedQuizzes));

    if (result.ok) {
      showToast({
        title: "Quizzes approved",
        description: `${selectedQuizzes.size} quiz(es) have been added to your library`,
        variant: "success",
      });

      setTimeout(() => {
        router.push("/quizzes");
      }, 1000);
    } else {
      showToast({
        title: "Approval failed",
        description: result.message || "Failed to approve quizzes",
        variant: "error",
      });
    }

    setProcessing(false);
  };

  const handleDelete = async () => {
    if (
      !confirm(
        "Are you sure you want to delete this generation job? This cannot be undone.",
      )
    ) {
      return;
    }

    setProcessing(true);

    const result = await deleteGenerationJob(jobId);

    if (result.ok) {
      showToast({
        title: "Job deleted",
        description: "Generation job has been deleted",
        variant: "success",
      });

      router.push("/quizzes/ai-generate");
    } else {
      showToast({
        title: "Delete failed",
        description: result.message || "Failed to delete job",
        variant: "error",
      });
    }

    setProcessing(false);
  };

  if (error || status === "failed") {
    return (
      <div className="max-w-2xl mx-auto">
        <div
          className="bg-[var(--color-error)]/10 border-2 border-[var(--color-error)] rounded-xl p-8 text-center"
          style={{ boxShadow: "var(--drop-shadow-sm)" }}
        >
          <Icon
            icon="mdi:alert-circle"
            className="w-16 h-16 mx-auto mb-4 text-[var(--color-error)]"
          />
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
            Generation Failed
          </h2>
          <p className="text-[var(--color-text-secondary)] mb-6">
            {error || "An error occurred"}
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              variant="ghost"
              onClick={() => router.push("/quizzes/ai-generate")}
            >
              Try Again
            </Button>
            <Button variant="error" onClick={handleDelete}>
              Delete Job
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (status === "processing" || status === "pending") {
    return (
      <ProcessingState
        progress={progress}
        total={total}
        quizProgress={quizProgress}
      />
    );
  }

  // Completed status - show quizzes
  const currentQuiz = quizzes.find((q) => q.tempId === viewingQuiz);

  return (
    <div className="space-y-6 max-w-full">
      {/* Header */}
      <div
        className="bg-[var(--color-bg2)] rounded-xl p-6 border border-[var(--color-bg4)]"
        style={{ boxShadow: "var(--drop-shadow-sm)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-2">
              Generated Quizzes Ready
            </h2>
            <p className="text-[var(--color-text-secondary)]">
              {quizzes.length} quiz(es) have been generated. Review and approve
              the ones you want to add to your library.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="ghost"
              onClick={handleDelete}
              disabled={processing}
            >
              <Icon icon="mdi:delete" className="w-4 h-4 mr-2" />
              Delete Job
            </Button>
            <Button
              onClick={handleApprove}
              disabled={selectedQuizzes.size === 0 || processing}
            >
              {processing ? (
                <>
                  <Icon
                    icon="mdi:loading"
                    className="w-4 h-4 animate-spin mr-2"
                  />
                  Approving...
                </>
              ) : (
                <>
                  <Icon icon="mdi:check-circle" className="w-4 h-4 mr-2" />
                  Approve Selected ({selectedQuizzes.size})
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Selection Controls */}
      <div className="flex items-center gap-4 px-1">
        <button
          onClick={toggleSelectAll}
          className="text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          {selectedQuizzes.size === quizzes.length
            ? "Deselect All"
            : "Select All"}
        </button>
        <span className="text-sm text-[var(--color-text-secondary)]">
          {selectedQuizzes.size} of {quizzes.length} selected
        </span>
      </div>

      {/* Split View: Quiz List (Left) and Preview (Right) */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Side: Quiz List */}
        <div className="col-span-4 space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto pr-2">
          {quizzes.map((quiz, index) => (
            <QuizListItem
              key={quiz.tempId}
              quiz={quiz}
              index={index}
              isSelected={selectedQuizzes.has(quiz.tempId)}
              isViewing={viewingQuiz === quiz.tempId}
              onToggleSelect={toggleSelectQuiz}
              onView={setViewingQuiz}
            />
          ))}
        </div>

        {/* Right Side: Quiz Preview */}
        <div className="col-span-8">
          {currentQuiz ? (
            <div
              className="bg-[var(--color-bg2)] rounded-xl p-6 border border-[var(--color-bg4)]"
              style={{ boxShadow: "var(--drop-shadow-sm)" }}
            >
              {/* Quiz Header */}
              <div className="flex items-start justify-between mb-6 pb-4 border-b border-[var(--color-bg4)]">
                <div className="flex-1">
                  <h2 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-2">
                    {currentQuiz.name}
                  </h2>
                  <div className="flex items-center gap-4 text-sm text-[var(--color-text-secondary)]">
                    <span className="capitalize">{currentQuiz.quizType}</span>
                    {currentQuiz.subject && (
                      <span>• {currentQuiz.subject}</span>
                    )}
                    {currentQuiz.topic && <span>• {currentQuiz.topic}</span>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  onClick={() =>
                    router.push(
                      `/quizzes/ai-generate/review/${jobId}/edit/${currentQuiz.tempId}`,
                    )
                  }
                >
                  <Icon icon="mdi:pencil" className="w-4 h-4 mr-2" />
                  Edit Full Quiz
                </Button>
              </div>

              {/* Quiz Content with Edit Buttons */}
              <div className="max-h-[calc(100vh-400px)] overflow-y-auto pr-2">
                {currentQuiz.quizType === "basic" ||
                currentQuiz.quizType === "rapid" ? (
                  <BasicOrRapidQuizPreview
                    data={currentQuiz as never}
                    showEditButtons={true}
                    onEditQuestion={(questionIndex) =>
                      router.push(
                        `/quizzes/ai-generate/review/${jobId}/edit/${currentQuiz.tempId}?question=${questionIndex}`,
                      )
                    }
                  />
                ) : (
                  <CrosswordQuizPreview
                    data={currentQuiz as never}
                    showEditButtons={false}
                    onEditQuestion={(questionIndex) =>
                      router.push(
                        `/quizzes/ai-generate/review/${jobId}/edit/${currentQuiz.tempId}?question=${questionIndex}`,
                      )
                    }
                  />
                )}
              </div>
            </div>
          ) : (
            <div
              className="bg-[var(--color-bg2)] rounded-xl p-12 text-center border border-[var(--color-bg4)]"
              style={{ boxShadow: "var(--drop-shadow-sm)" }}
            >
              <Icon
                icon="mdi:file-document-outline"
                className="w-20 h-20 mx-auto mb-4 text-[var(--color-text-secondary)] opacity-40"
              />
              <p className="text-[var(--color-text-secondary)]">
                Select a quiz from the list to preview
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
