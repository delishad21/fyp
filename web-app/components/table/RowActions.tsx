"use client";

/**
 * RowActions Component
 *
 * Purpose:
 *   - Provides small inline action buttons (Edit / Delete) for use in table rows or cards.
 *   - Wraps `IconButton` with a "borderless" variant to keep actions compact and visually subtle.
 *
 * Props:
 *   @param {() => void} [onEdit]
 *     - Optional callback when the edit button is clicked.
 *   @param {() => void} [onDelete]
 *     - Optional callback when the delete button is clicked.
 *   @param {boolean} [editLoading]
 *     - If true, shows a loading spinner on the edit button.
 *   @param {boolean} [deleteLoading]
 *     - If true, shows a loading spinner on the delete button.
 *
 * Behavior / Logic:
 *   - Renders an Edit button if `onEdit` is provided.
 *   - Renders a Delete button if `onDelete` is provided.
 *   - Uses `IconButton` loading state to prevent double-clicks while an action is in progress.
 *   - Delete button is styled in `text-[var(--color-error)]` to indicate destructive action.
 *
 */

import IconButton from "../ui/buttons/IconButton";

export default function RowActions({
  onEdit,
  onDelete,
  editLoading,
  deleteLoading,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  editLoading?: boolean;
  deleteLoading?: boolean;
}) {
  return (
    <div className="flex items-center mr-2">
      {onEdit && (
        <IconButton
          icon="mingcute:edit-line"
          title="Edit"
          variant="borderless"
          size="md"
          onClick={onEdit}
          loading={editLoading}
        />
      )}
      {onDelete && (
        <IconButton
          icon="mingcute:delete-2-line"
          title="Delete"
          variant="borderless"
          size="md"
          onClick={onDelete}
          className="text-[var(--color-error)]"
          loading={deleteLoading}
        />
      )}
    </div>
  );
}
