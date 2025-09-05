"use client";

/**
 * Cell for displaying dates in a table
 */

import type { DateCell as DateCellType } from "../../../services/quiz/types/quiz-table-types";

function fmt(isoOrDate: string | Date, format = "DD MMMM YYYY") {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "";
  const DD = String(d.getDate()).padStart(2, "0");
  const MMMM = d.toLocaleString("en-US", { month: "long" });
  const YYYY = String(d.getFullYear());
  return format
    .replace(/DD/g, DD)
    .replace(/MMMM/g, MMMM)
    .replace(/YYYY/g, YYYY);
}

export default function DateCell({ data }: DateCellType) {
  const { iso, format, color } = data;
  return (
    <span
      className="whitespace-nowrap text-sm leading-none"
      style={{ color: color ?? "var(--color-text-secondary)" }}
    >
      {fmt(iso, format)}
    </span>
  );
}
