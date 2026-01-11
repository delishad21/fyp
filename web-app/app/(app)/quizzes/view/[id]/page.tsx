import BasicOrRapidQuizPreview from "@/components/quizzes/quiz-view/BasicOrRapidQuizPreview";
import CrosswordQuizPreview from "@/components/quizzes/quiz-view/CrosswordQuizPreview";
import QuizViewHeader from "@/components/quizzes/quiz-view/QuizViewHeader";
import { getQuizForEdit } from "@/services/quiz/actions/get-quiz-action";
import {
  BasicInitial,
  RapidInitial,
  CrosswordInitial,
} from "@/services/quiz/types/quizTypes";
import { notFound } from "next/navigation";

type PageProps = {
  params: { id: string };
  searchParams: { version?: string };
};

export default async function Page({ params, searchParams }: PageProps) {
  const quizId = params.id;
  const versionParam = searchParams.version;
  const version =
    typeof versionParam === "string" && versionParam.trim() !== ""
      ? Number(versionParam)
      : undefined;

  const result = await getQuizForEdit(quizId, version);
  if (!result.ok) {
    if (result.status === 404) {
      notFound();
    }
    return (
      <div className="px-10 pt-6">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          Failed to load quiz
        </h1>
        <p className="mt-2 text-[var(--color-text-secondary)]">
          {result.message || "An error occurred while fetching the quiz."}
        </p>
      </div>
    );
  }

  const { data, versions, currentVersion } = result;
  const quizType = data.quizType;

  return (
    <div className="px-10 pt-6 space-y-6">
      <QuizViewHeader
        quizId={quizId}
        quizType={quizType}
        name={data.name}
        subject={data.subject}
        topic={data.topic}
        versions={versions}
        currentVersion={currentVersion}
        subjectColorHex={data.subjectColorHex}
        typeColorHex={data.typeColorHex}
        totalTimeLimit={
          "totalTimeLimit" in data ? data.totalTimeLimit ?? null : null
        }
      />

      <div className="space-y-4">
        {/* Quiz content */}
        {quizType === "basic" || quizType === "rapid" ? (
          <BasicOrRapidQuizPreview data={data as BasicInitial | RapidInitial} />
        ) : (
          <CrosswordQuizPreview data={data as CrosswordInitial} />
        )}
      </div>
    </div>
  );
}
