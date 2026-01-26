"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import BasicQuizForm from "@/components/quizzes/quiz-forms/BasicQuizForm";
import CrosswordQuizForm from "@/components/quizzes/quiz-forms/CrosswordQuizForm";
import RapidQuizForm from "@/components/quizzes/quiz-forms/RapidQuizForm";
import {
  getGenerationStatus,
  updateDraftQuiz,
  type DraftQuiz,
} from "@/services/ai-generation/ai-generation-actions";
import { getFilterMeta } from "@/services/quiz/actions/quiz-metadata-actions";
import type { FilterMeta } from "@/services/quiz/types/quiz-table-types";
import { getQuizTypeColors } from "@/services/quiz/actions/quiz-type-colors-action";
import { useToast } from "@/components/ui/toast/ToastProvider";
import Link from "next/link";
import { Icon } from "@iconify/react";

export default function Page({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string; tempId: string }>;
  searchParams: Promise<{ question?: string }>;
}) {
  const { jobId, tempId } = use(params);
  const searchParamsResolved = use(searchParams);
  const questionIndex = searchParamsResolved?.question
    ? Number(searchParamsResolved.question)
    : undefined;
  const router = useRouter();
  const { showToast } = useToast();
  const [quiz, setQuiz] = useState<DraftQuiz | null>(null);
  const [meta, setMeta] = useState<FilterMeta | null>(null);
  const [typeColors, setTypeColors] = useState<Record<string, string> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [quizResult, metaData, colors] = await Promise.all([
          getGenerationStatus(jobId),
          getFilterMeta(),
          getQuizTypeColors(),
        ]);

        if (!quizResult.ok || !quizResult.job) {
          router.push(`/quizzes/ai-generate/review/${jobId}`);
          return;
        }

        const foundQuiz = quizResult.job.results?.quizzes.find(
          (q) => q.tempId === tempId,
        );

        if (!foundQuiz) {
          router.push(`/quizzes/ai-generate/review/${jobId}`);
          return;
        }

        setQuiz(foundQuiz);
        setMeta(metaData);
        setTypeColors(colors);
      } catch {
        showToast({
          title: "Error",
          description: "Failed to load quiz data",
          variant: "error",
        });
        router.push(`/quizzes/ai-generate/review/${jobId}`);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [jobId, tempId, router, showToast]);

  const handleSave = async (data: Record<string, unknown>) => {
    setSaving(true);
    const result = await updateDraftQuiz(jobId, tempId, data);

    if (result.ok) {
      showToast({
        title: "Quiz updated",
        description: "Your changes have been saved",
        variant: "success",
      });
      router.push(`/quizzes/ai-generate/review/${jobId}`);
    } else {
      showToast({
        title: "Update failed",
        description: result.message || "Failed to update quiz",
        variant: "error",
      });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="px-10 pt-6">
        <div className="flex items-center justify-center h-64">
          <Icon
            icon="mdi:loading"
            className="w-8 h-8 animate-spin text-[var(--color-accent)]"
          />
        </div>
      </div>
    );
  }

  if (!quiz || !meta || !typeColors) {
    return null;
  }

  let form: React.ReactNode = null;

  if (quiz.quizType === "rapid") {
    form = (
      <RapidQuizForm
        key={`rapid-draft-${tempId}`}
        meta={meta}
        mode="draft"
        initialData={quiz as never}
        typeColorHex={typeColors.rapid}
        onSubmit={handleSave}
        saving={saving}
        initialQuestionIndex={questionIndex}
      />
    );
  } else if (quiz.quizType === "crossword") {
    form = (
      <CrosswordQuizForm
        key={`crossword-draft-${tempId}`}
        meta={meta}
        mode="draft"
        initialData={quiz as never}
        typeColorHex={typeColors.crossword}
        onSubmit={handleSave}
        saving={saving}
        initialQuestionIndex={questionIndex}
      />
    );
  } else if (quiz.quizType === "basic") {
    form = (
      <BasicQuizForm
        key={`basic-draft-${tempId}`}
        meta={meta}
        mode="draft"
        initialData={quiz as never}
        typeColorHex={typeColors.basic}
        onSubmit={handleSave}
        saving={saving}
        initialQuestionIndex={questionIndex}
      />
    );
  }

  return (
    <div className="px-10 pt-6">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href={`/quizzes/ai-generate/review/${jobId}`}
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors"
        >
          <Icon icon="mdi:arrow-left" className="w-6 h-6" />
        </Link>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          Edit Generated Quiz
        </h1>
      </div>
      {form}
    </div>
  );
}
