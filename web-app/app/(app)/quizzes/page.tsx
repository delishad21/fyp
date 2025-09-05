// app/quizzes/page.tsx
import CreateQuizCard from "@/components/quizzes/CreateQuizCard";
import { QuizTypeDef } from "@/services/quiz/types/quizTypes";
import QuizzesTable from "@/components/quizzes/QuizzesTable";
import type { ColumnDef, Query } from "@/services/quiz/types/quiz-table-types";
import { queryQuizzes } from "@/services/quiz/actions/query-quiz-action";
import { getFilterMeta } from "@/services/quiz/actions/quiz-metadata-actions";

export default async function Page() {
  const columns: ColumnDef[] = [
    { header: "Name", width: 2 },
    { header: "Subject", width: 1 },
    { header: "Topic", width: 1 },
    { header: "Created", width: 1 },
    { header: "Type", width: 1 },
  ];

  const quizzes: QuizTypeDef[] = [
    {
      title: "Basic",
      id: "basic",
      description: [
        "Customize question type (multiple choice, open ended)",
        "Customise time limit",
      ],
      color: "#22c55e",
      href: "/quizzes/create/basic",
    },
    {
      title: "Crossword",
      id: "crossword",
      description: ["Key in up to 10 words and generate a crossword puzzle"],
      imagePath: "/images/quiz-crossword.png",
      color: "#3b82f6",
      href: "/quizzes/create/crossword",
    },
    {
      title: "Rapid",
      id: "rapid",
      description: ["Fast-paced multiple choice questions"],
      imagePath: "/images/quiz-rapid.png",
      color: "#f59e0b",
      href: "/quizzes/create/rapid",
    },
  ];

  // Server-side bootstrap
  const meta = await getFilterMeta();
  const initialQuery: Query = { page: 1, pageSize: 10 };
  const first = await queryQuizzes(initialQuery);

  const initial = {
    rows: first.rows,
    page: first.page,
    pageCount: first.pageCount,
    pageSize: 10,
    meta,
    query: initialQuery,
  };

  return (
    <div className="space-y-4 px-10 pt-5">
      <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
        Create New Quiz
      </h1>
      <div className="flex gap-10 ">
        {quizzes.map((quiz) => (
          <CreateQuizCard
            key={quiz.title}
            color={quiz.color}
            title={quiz.title}
            description={quiz.description}
            href={quiz.href}
            screenshot={quiz.imagePath}
            className="flex-1"
          />
        ))}
      </div>

      <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
        Created Quizzes
      </h1>

      {/* Handlers live in the client wrapper */}
      <QuizzesTable initial={initial} columns={columns} />
    </div>
  );
}
