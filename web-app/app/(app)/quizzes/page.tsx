import type { ColumnDef, Query } from "@/services/quiz/types/quiz-table-types";
import QuizzesTable from "@/components/quizzes/QuizzesTable";
import { queryQuizzes } from "@/services/quiz/actions/query-quiz-action";
import { getFilterMeta } from "@/services/quiz/actions/quiz-metadata-actions";
import Button from "@/components/ui/buttons/Button";

export default async function Page() {
  const columns: ColumnDef[] = [
    { header: "Name", width: 2 },
    { header: "Subject", width: 1 },
    { header: "Topic", width: 1 },
    { header: "Created", width: 1 },
    { header: "Type", width: 1 },
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
    <div className="px-10 pt-5">
      <div className="mb-6 flex justify-between items-center">
        <Button
          href="/quizzes/create"
          variant="primary"
          className="px-8 py-4 text-lg font-semibold"
        >
          Create New Quiz
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Your Quizzes
        </h1>
      </div>

      {/* Handlers live in the client wrapper */}
      <QuizzesTable initial={initial} columns={columns} schedulable />
    </div>
  );
}
