import QuizViewHeader from "@/components/quizzes/quiz-view/QuizViewHeader";
import { getQuizForEdit } from "@/services/quiz/actions/get-quiz-action";
import { notFound } from "next/navigation";
import QuizViewClient from "@/components/quizzes/quiz-view/QuizViewClient";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
};

export default async function Page({ params, searchParams }: PageProps) {
  const { id: quizId } = await params;
  const versionParam = (await searchParams).version;
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
          "totalTimeLimit" in data ? (data.totalTimeLimit ?? null) : null
        }
      />

      <QuizViewClient
        quizId={quizId}
        quizType={quizType}
        data={data}
        currentVersion={currentVersion}
      />
    </div>
  );
}
