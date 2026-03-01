"use client";

/**
 * Cell for displaying tags in a table
 */

import type { TagsCell as TagsCellType } from "../../../services/quiz/types/quiz-table-types";

export default function TagsCell({ data }: TagsCellType) {
  const isColumn = data.stack === "column";

  return (
    <span className={isColumn ? "flex flex-col gap-1.5" : "flex flex-wrap gap-2"}>
      {data.tags.map((t, idx) => (
        <span
          key={idx}
          className={`inline-flex items-center rounded-full px-2.5 py-1.5 text-xs ${
            t.bold ? "font-bold" : "font-semibold"
          }`}
          style={{
            color: "var(--color-text-primary)",
            background: t.color,
          }}
        >
          {t.tag}
        </span>
      ))}
    </span>
  );
}
