"use client";

import type {
  ColumnDef,
  RowData,
} from "../../services/quiz/types/quiz-table-types";
import TableRowCard from "./TableRowCard";

export type DragConfig = {
  enabled?: boolean; // default false
  getDragData?: (row: RowData) => unknown; // data stored in dnd-kit event
};

export default function CardTable({
  columns,
  rows,
  onEdit,
  onView,
  onDuplicate,
  onSchedule,
  onDelete,
  onRowClick,
  spacing,
  dragConfig,
  draggable = false,
}: {
  columns: ColumnDef[];
  rows: RowData[];
  onEdit?: (row: RowData) => void | Promise<void>;
  onView?: (row: RowData) => void | Promise<void>;
  onDuplicate?: (row: RowData) => void | Promise<void>;
  onSchedule?: (row: RowData) => void | Promise<void>;
  onDelete?: (row: RowData) => void | Promise<void>;
  onRowClick?: (row: RowData) => void | Promise<void>;
  spacing?: "compact" | "normal" | "expanded";
  dragConfig?: DragConfig;
  draggable?: boolean;
}) {
  const hasActions = Boolean(
    onEdit || onView || onDuplicate || onSchedule || onDelete
  );
  const colTracks = columns
    .map((c) => `minmax(0, ${c.width ?? 1}fr)`)
    .join(" ");
  const ACTIONS_COL = hasActions ? 190 : 0;
  const gridTemplate = `${colTracks}${hasActions ? ` ${ACTIONS_COL}px` : ""}`;

  return (
    <div className="w-full">
      {/* header */}
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
          <div className="flex items-center justify-end px-2 py-1.5 text-sm font-semibold text-[var(--color-text-secondary)]">
            Actions
          </div>
        )}
      </div>

      {/* rows */}
      <div
        className={`${
          spacing === "expanded"
            ? "space-y-4"
            : spacing === "compact"
            ? "space-y-1"
            : "space-y-2"
        }`}
      >
        {rows.map((row) => (
          <TableRowCard
            key={row.id}
            columns={columns}
            row={row}
            gridTemplate={gridTemplate}
            onView={onView}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onSchedule={onSchedule}
            onDelete={onDelete}
            onRowClick={onRowClick}
            dragData={
              dragConfig?.enabled && dragConfig.getDragData
                ? dragConfig.getDragData(row)
                : undefined
            }
            draggable={draggable}
          />
        ))}
      </div>
    </div>
  );
}
