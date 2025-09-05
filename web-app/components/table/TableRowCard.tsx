"use client";

/**
 * TableRowCard Component
 *
 * Purpose:
 *   - Renders a single row in a card-style grid layout.
 *   - Displays data cells according to their variant (normal, label, tags, progress bar, date).
 *   - Optionally includes inline action buttons (Edit/Delete) with loading states.
 *
 * Props:
 *   @param {ColumnDef[]} columns
 *     - Column definitions (headers, alignment, width, etc.).
 *
 *   @param {RowData} row
 *     - Row object containing cell values and metadata.
 *
 *   @param {string} gridTemplate
 *     - CSS grid-template-columns string, usually computed by the parent table.
 *
 *   @param {(row: RowData) => void | Promise<void>} [onEdit]
 *     - Optional callback when Edit is triggered. Supports async.
 *
 *   @param {(row: RowData) => void | Promise<void>} [onDelete]
 *     - Optional callback when Delete is triggered. Supports async.
 *
 * Behavior / Logic:
 *   - `renderCell` maps each cell variant to a specialized cell component:
 *       • NormalCell, LabelCell, TagsCell, ProgressBarCell, DateCell.
 *   - Tracks `editLoading` and `deleteLoading` states to show spinners while actions are in progress.
 *   - Calls `onEdit` and `onDelete` safely inside `handleEdit` / `handleDelete` with loading state management.
 *
 * UI:
 *   - Grid layout with `gridTemplateColumns` matching the parent table’s column setup.
 *   - Each cell is wrapped in a `<div>` with padding and alignment based on column definition.
 *   - Row actions (if provided) are rendered on the right side via <RowActions>.
 *   - Styling:
 *       • Rounded corners (`rounded-xl`).
 *       • Background color (`bg-[var(--color-bg3)]`).
 *       • Text alignment per column (`left`, `center`, `right`).
 *
 */

import type {
  ColumnDef,
  RowData,
  Cell,
} from "../../services/quiz/types/quiz-table-types";
import NormalCell from "./cells/NormalCell";
import LabelCell from "./cells/LabelCell";
import TagsCell from "./cells/TagsCell";
import ProgressBarCell from "./cells/ProgressBarCell";
import DateCell from "./cells/DateCell";
import RowActions from "./RowActions";
import { useState } from "react";

export default function TableRowCard({
  columns,
  row,
  gridTemplate,
  onEdit,
  onDelete,
}: {
  columns: ColumnDef[];
  row: RowData;
  gridTemplate: string;
  onEdit?: (row: RowData) => void | Promise<void>;
  onDelete?: (row: RowData) => void | Promise<void>;
}) {
  const hasActions = Boolean(onEdit || onDelete);

  const renderCell = (cell: Cell) => {
    switch (cell.variant) {
      case "normal":
        return <NormalCell {...cell} />;
      case "label":
        return <LabelCell {...cell} />;
      case "tags":
        return <TagsCell {...cell} />;
      case "progressbar":
        return <ProgressBarCell {...cell} />;
      case "date":
        return <DateCell {...cell} />;
      default:
        return null;
    }
  };

  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleEdit = async () => {
    setEditLoading(true);
    try {
      await onEdit?.(row);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await onDelete?.(row);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div
      className="grid items-center rounded-xl bg-[var(--color-bg3)]"
      style={{ gridTemplateColumns: gridTemplate }}
    >
      {columns.map((c, idx) => (
        <div
          key={c.header + idx}
          className={`px-3 py-1.5 text-sm ${
            c.align === "right"
              ? "text-right"
              : c.align === "center"
              ? "text-center"
              : "text-left"
          } text-[var(--color-text-primary)]`}
        >
          {renderCell(row.cells[idx])}
        </div>
      ))}

      {hasActions && (
        <RowActions
          onEdit={handleEdit}
          onDelete={handleDelete}
          editLoading={editLoading}
          deleteLoading={deleteLoading}
        />
      )}
    </div>
  );
}
