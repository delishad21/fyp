"use client";

/**
 * RowActions Component
 *
 * Purpose:
 *   - Provides small inline action buttons (View / Edit / Duplicate / Delete)
 *     for use in table rows or cards.
 *
 * Behavior:
 *   - Buttons are optional; only rendered if corresponding callbacks are provided.
 *   - Edit/Delete support loading states to prevent double-clicks.
 */

import IconButton from "../ui/buttons/IconButton";

export default function RowActions({
  onView,
  onEdit,
  onDuplicate,
  onSchedule,
  onDelete,
  editLoading,
  deleteLoading,
}: {
  onView?: (e?: React.MouseEvent) => void;
  onEdit?: (e?: React.MouseEvent) => void;
  onDuplicate?: (e?: React.MouseEvent) => void;
  onSchedule?: (e?: React.MouseEvent) => void;
  onDelete?: (e?: React.MouseEvent) => void;
  editLoading?: boolean;
  deleteLoading?: boolean;
}) {
  return (
    <div className="mr-2 flex items-center justify-end gap-1.5">
      {onView && (
        <IconButton
          icon="mingcute:eye-line"
          title="View"
          variant="borderless"
          size="md"
          onClick={(e) => {
            e.stopPropagation();
            onView?.(e);
          }}
        />
      )}

      {onEdit && (
        <IconButton
          icon="mingcute:edit-line"
          title="Edit"
          variant="borderless"
          size="md"
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.(e);
          }}
          loading={editLoading}
        />
      )}

      {onDuplicate && (
        <IconButton
          icon="mingcute:copy-2-line"
          title="Duplicate"
          variant="borderless"
          size="md"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate?.(e);
          }}
        />
      )}

      {onSchedule && (
        <IconButton
          icon="mingcute:calendar-add-line"
          title="Schedule"
          variant="borderless"
          size="md"
          onClick={(e) => {
            e.stopPropagation();
            onSchedule?.(e);
          }}
        />
      )}

      {onDelete && (
        <IconButton
          icon="mingcute:delete-2-line"
          title="Delete"
          variant="borderless"
          size="md"
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.(e);
          }}
          className="text-[var(--color-error)]"
          loading={deleteLoading}
        />
      )}
    </div>
  );
}
