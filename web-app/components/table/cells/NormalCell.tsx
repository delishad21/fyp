"use client";

/**
 * Cell for displaying normal text in a table
 */

import type { NormalCell as NormalCellType } from "../../../services/quiz/types/quiz-table-types";

export default function NormalCell({ data }: NormalCellType) {
  const { text, bold, color } = data;
  return (
    <span
      className={bold ? "font-semibold" : ""}
      style={{ color: color || "var(--color-text-primary)" }}
    >
      {text}
    </span>
  );
}
