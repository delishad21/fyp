"use client";

import { useCallback, useMemo, useState } from "react";
import type { FilterMeta } from "@/services/quiz/types/quiz-table-types";
import { getFilterMeta } from "@/services/quiz/actions/quiz-metadata-actions";
import { SubjectManagerSection } from "./SubjectManagerSection";
import { TopicManagerSection } from "./TopicManagerSection";

function sortSubjects(
  subjects: Array<{ label: string; value: string; colorHex?: string }>
) {
  return [...subjects].sort((a, b) => a.label.localeCompare(b.label));
}

function sortTopics(topics: Array<{ label: string; value: string }>) {
  return [...topics].sort((a, b) => a.label.localeCompare(b.label));
}

export default function QuizMetaManager({ initialMeta }: { initialMeta: FilterMeta }) {
  const [subjects, setSubjects] = useState(() =>
    sortSubjects(initialMeta.subjects || [])
  );
  const [topics, setTopics] = useState(() => sortTopics(initialMeta.topics || []));
  const [refreshing, setRefreshing] = useState(false);

  const applyMeta = useCallback((meta: FilterMeta) => {
    setSubjects(sortSubjects(meta.subjects || []));
    setTopics(sortTopics(meta.topics || []));
  }, []);

  const refreshMeta = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await getFilterMeta();
      applyMeta(next);
    } finally {
      setRefreshing(false);
    }
  }, [applyMeta]);

  const metaCounts = useMemo(
    () => ({ subjects: subjects.length, topics: topics.length }),
    [subjects.length, topics.length]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/40 p-4">
        <p className="text-sm text-[var(--color-text-secondary)]">
          Manage your quiz metadata used across creation, filtering, and scheduling.
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
          {metaCounts.subjects} subject(s) and {metaCounts.topics} topic(s)
          {refreshing ? " • Refreshing…" : ""}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SubjectManagerSection
          subjects={subjects}
          refreshing={refreshing}
          onRefresh={refreshMeta}
          onMetaUpdated={applyMeta}
        />
        <TopicManagerSection
          topics={topics}
          refreshing={refreshing}
          onRefresh={refreshMeta}
          onMetaUpdated={applyMeta}
        />
      </div>
    </div>
  );
}
