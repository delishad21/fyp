"use client";

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
import AvatarCell from "./cells/AvatarCell";
import { useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Icon } from "@iconify/react";

const HANDLE_BTN = 28; // px (button square)
const ICON_NAME = "mdi:drag-vertical";

export default function TableRowCard({
  columns,
  row,
  gridTemplate,
  onEdit,
  onView,
  onDuplicate,
  onSchedule,
  onDelete,
  onRowClick,
  dragData,
  draggable = false,
}: {
  columns: ColumnDef[];
  row: RowData;
  gridTemplate: string;
  onEdit?: (row: RowData) => void | Promise<void>;
  onView?: (row: RowData) => void | Promise<void>;
  onDuplicate?: (row: RowData) => void | Promise<void>;
  onSchedule?: (row: RowData) => void | Promise<void>;
  onDelete?: (row: RowData) => void | Promise<void>;
  onRowClick?: (row: RowData) => void | Promise<void>;
  dragData?: unknown; // DnD payload; caller decides shape
  draggable?: boolean;
}) {
  const hasActions = Boolean(
    onEdit || onView || onDuplicate || onSchedule || onDelete
  );
  const isClickable = Boolean(onRowClick);

  const isDraggable = draggable && Boolean(dragData);

  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `row-${row.id}`,
    data: dragData as Record<string, unknown> | undefined,
    disabled: !isDraggable,
  });

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
      case "avatar":
        return <AvatarCell {...cell} />;
      default:
        return null;
    }
  };

  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleEdit = async (e?: ReactMouseEvent) => {
    e?.stopPropagation();
    setEditLoading(true);
    try {
      await onEdit?.(row);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (e?: ReactMouseEvent) => {
    e?.stopPropagation();
    setDeleteLoading(true);
    try {
      await onDelete?.(row);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleView = (e?: ReactMouseEvent) => {
    e?.stopPropagation();
    onView?.(row);
  };

  const handleDuplicate = (e?: ReactMouseEvent) => {
    e?.stopPropagation();
    onDuplicate?.(row);
  };

  const handleSchedule = (e?: ReactMouseEvent) => {
    e?.stopPropagation();
    onSchedule?.(row);
  };

  const handleRowClick = async () => {
    if (!onRowClick) return;
    await onRowClick(row);
  };

  const template = isDraggable ? `max-content ${gridTemplate}` : gridTemplate;

  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : -1}
      onClick={isClickable ? handleRowClick : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleRowClick();
              }
            }
          : undefined
      }
      className={[
        "grid items-center rounded-xl bg-[var(--color-bg3)] min-h-11 transition-all duration-200 ease-out shadow-sm",
        isClickable
          ? "hover:opacity-80 hover:scale-[1.01] hover:-translate-y-0.5 hover:shadow-[var(--drop-shadow)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          : "",
        isDragging ? "invisible pointer-events-none" : "",
      ].join(" ")}
      style={{ gridTemplateColumns: template }}
    >
      {/* Drag handle column (only when draggable) */}
      {isDraggable && (
        <div className="pl-2">
          <button
            ref={setNodeRef}
            type="button"
            className="flex items-center justify-center rounded-md cursor-grab active:cursor-grabbing hover:bg-[var(--color-bg2)]"
            style={{ width: HANDLE_BTN, height: HANDLE_BTN }}
            {...listeners}
            {...attributes}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <Icon
              icon={ICON_NAME}
              className="pointer-events-none text-[var(--color-text-secondary)]"
              style={{
                width: Math.max(16, Math.round(HANDLE_BTN * 0.55)),
                height: Math.max(16, Math.round(HANDLE_BTN * 0.55)),
              }}
            />
          </button>
        </div>
      )}

      {/* Row content */}
      <>
        {columns.map((c, idx) => (
          <div
            key={c.header + idx}
            className={`px-3 py-2 text-sm ${
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
            onView={onView ? handleView : undefined}
            onEdit={onEdit ? handleEdit : undefined}
            onDuplicate={onDuplicate ? handleDuplicate : undefined}
            onSchedule={onSchedule ? handleSchedule : undefined}
            onDelete={onDelete ? handleDelete : undefined}
            editLoading={editLoading}
            deleteLoading={deleteLoading}
          />
        )}
      </>
    </div>
  );
}
