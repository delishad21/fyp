"use client";

import { useState } from "react";
import StudentAttemptsClient from "./StudentAttemptsClient";
import type {
  ColumnDef,
  RowData,
} from "@/services/quiz/types/quiz-table-types";
import StudentStatsDisplay from "./StudentStatsDisplay";

type AttemptsProps = {
  columns: ColumnDef[];
  rows: RowData[];
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
};

type StatsProps = {
  rank: number | null;
  stats: null | {
    classId: string;
    studentId: string;
    sumScore: number;
    sumMax: number;
    participationCount: number;
    participationPct?: number; // 0..100
    avgScorePct?: number; // 0..100
    streakDays: number;
    lastStreakDate?: string | Date | null;
    overallScore: number;
    canonicalBySchedule?: Record<
      string,
      {
        attemptId: string;
        score: number;
        maxScore: number;
        finishedAt: string | Date;
        subject?: string;
        topic?: string;
      }
    >;
    attendanceDays?: Record<string, boolean>;
    bySubject?: Record<
      string,
      { sumScore: number; sumMax: number; attempts: number }
    >;
    byTopic?: Record<
      string,
      { sumScore: number; sumMax: number; attempts: number }
    >;
    subjectsAvgPct?: Record<string, number>;
    topicsAvgPct?: Record<string, number>;
    version: number;
    updatedAt: string | Date;
  };
};

export default function StudentProfileSwitcher({
  classId,
  studentId,
  attemptsProps,
  statsProps,
}: {
  classId: string;
  studentId: string;
  attemptsProps: AttemptsProps;
  statsProps: StatsProps;
}) {
  const [tab, setTab] = useState<"attempts" | "statistics">("attempts");

  return (
    <div className="space-y-4">
      {/* Tabs-like nav without background */}
      <nav>
        <ul className="flex gap-2">
          {[
            { key: "attempts", label: "Attempts" },
            { key: "statistics", label: "Statistics" },
          ].map((t) => {
            const active = tab === (t.key as typeof tab);
            return (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => setTab(t.key as typeof tab)}
                  className={[
                    "inline-flex items-center rounded-sm px-3 py-1.5 text-md transition",
                    active
                      ? "bg-[var(--color-primary)] text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-primary)] hover:bg-[var(--color-bg3)]",
                  ].join(" ")}
                >
                  {t.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {tab === "attempts" ? (
        <StudentAttemptsClient
          classId={classId}
          studentId={studentId}
          columns={attemptsProps.columns}
          rows={attemptsProps.rows}
          page={attemptsProps.page}
          pageCount={attemptsProps.pageCount}
          total={attemptsProps.total}
          pageSize={attemptsProps.pageSize}
        />
      ) : (
        <StudentStatsDisplay rank={statsProps.rank} stats={statsProps.stats} />
      )}
    </div>
  );
}
