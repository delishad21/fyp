"use client";

import { useEffect, useMemo, useState } from "react";
import Pagination from "@/components/table/Pagination";
import MultiSelect from "@/components/ui/selectors/multi-select/MultiSelect";
import TextSearch from "@/components/ui/text-inputs/TextSearch";
import { queryQuizzes } from "@/services/quiz/actions/query-quiz-action";
import { useDebounced } from "@/services/quiz/quiz-table-helpers/hooks/useDebounced";
import type { RowData } from "@/services/quiz/types/quiz-table-types";
import type { QuizBankState, QuizFilterMeta, QuizRowPayload } from "./types";
import QuizBankCard from "./QuizBankCard";

function toPayload(row: RowData): QuizRowPayload | null {
  const payload = row.payload as QuizRowPayload | undefined;
  if (!payload || !payload.id || !payload.title) return null;
  return payload;
}

function buildQuery({
  page,
  search,
  subjects,
  topics,
  types,
}: {
  page: number;
  search: string;
  subjects: string[];
  topics: string[];
  types: string[];
}) {
  return {
    page,
    pageSize: 10,
    ...(search ? { name: search } : {}),
    ...(subjects.length ? { subjects } : {}),
    ...(topics.length ? { topics } : {}),
    ...(types.length ? { types } : {}),
  };
}

export default function QuizBankSidebar({
  initial,
  filterMeta,
}: {
  initial: QuizBankState;
  filterMeta: QuizFilterMeta;
}) {
  const [search, setSearch] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);

  const [state, setState] = useState<QuizBankState>(initial);
  const [loading, setLoading] = useState(false);

  const debouncedSearch = useDebounced(search, 250);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await queryQuizzes(
        buildQuery({
          page: state.page,
          search: debouncedSearch.trim(),
          subjects,
          topics,
          types,
        })
      );
      if (cancelled) return;
      setState({
        rows: res.rows,
        page: res.page,
        pageCount: res.pageCount,
        total: res.total,
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, state.page, subjects, topics, types]);

  useEffect(() => {
    setState((prev) => ({ ...prev, page: 1 }));
  }, [debouncedSearch, subjects, topics, types]);

  const cards = useMemo(
    () =>
      state.rows
        .map((row) => ({ rowId: row.id, quiz: toPayload(row) }))
        .filter(
          (x): x is { rowId: string; quiz: QuizRowPayload } => Boolean(x.quiz)
        ),
    [state.rows]
  );

  return (
    <section className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Quiz Dragger
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Drag a quiz card into any class day cell.
          </p>
        </div>
        <div className="min-w-[240px]">
          <Pagination
            page={state.page}
            pageCount={Math.max(1, state.pageCount)}
            onPageChange={(page) => setState((prev) => ({ ...prev, page }))}
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <TextSearch
          label="Name"
          value={search}
          onChange={setSearch}
          placeholder="Search name..."
        />

        <MultiSelect
          label="Subject"
          options={filterMeta.subjects.map((s) => ({
            value: s.label,
            label: s.label,
            colorHex: s.colorHex,
          }))}
          value={subjects}
          onChange={setSubjects}
          className="min-w-[220px]"
        />

        <MultiSelect
          label="Topic"
          options={filterMeta.topics.map((t) => ({
            value: t.label,
            label: t.label,
          }))}
          value={topics}
          onChange={setTopics}
          className="min-w-[220px]"
        />

        <MultiSelect
          label="Type"
          options={filterMeta.types.map((t) => ({
            value: t.value,
            label: t.label,
            colorHex: t.colorHex,
          }))}
          value={types}
          onChange={setTypes}
          className="min-w-[220px]"
        />
      </div>

      <div className="relative">
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max gap-2">
            {cards.map((item) => (
              <QuizBankCard
                key={item.rowId}
                rowId={item.rowId}
                quiz={item.quiz}
              />
            ))}
          </div>
        </div>

        {loading && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          </div>
        )}

        {!loading && cards.length === 0 && (
          <div className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-3 text-sm text-[var(--color-text-secondary)]">
            No quizzes found.
          </div>
        )}
      </div>
    </section>
  );
}
