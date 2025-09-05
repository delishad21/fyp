"use client";

/**
 * CardTable Component
 *
 * Purpose:
 *   - Renders a responsive, card-like table layout using CSS grid.
 *   - Supports optional edit and delete actions for each row.
 *
 * Props:
 *   @param {ColumnDef[]} columns
 *     - Column definitions (header, width, alignment, etc.).
 *
 *   @param {RowData[]} rows
 *     - Data to render, each row matched against the column definitions.
 *
 *   @param {(row: RowData) => void | Promise<void>} [onEdit]
 *     - Optional handler triggered when a row's "Edit" action is clicked.
 *
 *   @param {(row: RowData) => void | Promise<void>} [onDelete]
 *     - Optional handler triggered when a row's "Delete" action is clicked.
 *
 * Behavior:
 *   - Builds grid template columns dynamically from `columns` config.
 *   - Displays a header row and a list of `TableRowCard` components.
 *   - Shows an "Actions" column only if edit/delete handlers are provided.
 *
 * Integration:
 *   - Designed as a flexible alternative to traditional `<table>` for quiz or data listings.
 *   - Uses `TableRowCard` for consistent per-row rendering.
 */

import type {
  ColumnDef,
  RowData,
} from "../../services/quiz/types/quiz-table-types";
import TableRowCard from "./TableRowCard";

export default function CardTable({
  columns,
  rows,
  onEdit,
  onDelete,
}: {
  columns: ColumnDef[];
  rows: RowData[];
  onEdit?: (row: RowData) => void | Promise<void>;
  onDelete?: (row: RowData) => void | Promise<void>;
}) {
  const hasActions = Boolean(onEdit || onDelete);

  const colTracks = columns
    .map((c) => `minmax(0, ${c.width ?? 1}fr)`)
    .join(" ");
  const gridTemplate = `${colTracks}${hasActions ? " max-content" : ""}`;

  return (
    <div className="w-full">
      {/* Header (no background) */}
      <div
        className="mb-2 grid items-center"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {columns.map((c, i) => (
          <div
            key={c.header + i}
            className={`flex items-center px-2.5 py-1.5 text-md font-semibold text-[var(--color-text-primary)] ${
              c.align === "right"
                ? "justify-end text-right"
                : c.align === "center"
                ? "justify-center text-center"
                : "justify-start text-left"
            }`}
          >
            {c.header}
          </div>
        ))}

        {hasActions && (
          <div className="flex items-center justify-end px-2 py-1.5 text-sm font-semibold text-[var(--color-text-primary)]">
            Actions
          </div>
        )}
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {rows.map((row) => (
          <TableRowCard
            key={row.id}
            columns={columns}
            row={row}
            gridTemplate={gridTemplate}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
