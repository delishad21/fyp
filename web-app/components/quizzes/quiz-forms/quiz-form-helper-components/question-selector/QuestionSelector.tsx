"use client";

/**
 * QuestionSelector Component
 *
 * Purpose:
 *   - Provides a compact UI for navigating between a list of quiz questions (or items).
 *   - Allows selecting, adding, and deleting items, with support for custom labels and error indicators.
 *
 * Props:
 *   @param {number} count - Total number of items currently available.
 *   @param {number} currentIndex - Index of the currently selected item.
 *   @param {number} [max] - Optional maximum number of items allowed.
 *   @param {number} [min=1] - Minimum number of items that must remain.
 *   @param {() => void} onAdd - Handler to add a new item.
 *   @param {(index: number) => void} onSelect - Handler to select an item by index.
 *   @param {(index: number) => void} [onDelete] - Optional handler to delete an item by index.
 *   @param {(index: number) => boolean|Promise<boolean>} [confirmDelete]
 *       - Optional confirmation hook before deletion; defaults to browser confirm dialog.
 *   @param {number[]} [errorIndexes] - List of indexes that should be styled as error states.
 *   @param {(string|React.ReactNode)[]} [labels] - Optional custom labels per item; defaults to "1", "2", ...
 *
 * Behavior:
 *   - Renders a row of circular buttons (1 per item).
 *   - Current item -> primary color.
 *   - Items with errors -> error color.
 *   - Others -> neutral background with hover highlight.
 *   - Left-click -> select item.
 *   - Right-click (context menu) -> delete item (if `onDelete` provided).
 *   - Add button (+) appears if under max limit.
 *   - Dedicated delete button (trash icon) deletes the current item,
 *     disabled if count <= min.
 *
 * UI:
 *   - Compact horizontal layout with circular buttons for navigation.
 *   - Hover and disabled states styled via `clsx` and theme colors.
 *   - Tooltips (`title`) describe the action for accessibility.
 */

import IconButton from "@/components/ui/buttons/IconButton";
import IndexButton from "@/components/ui/buttons/IndexButton";
import clsx from "clsx";

export default function QuestionSelector({
  count,
  currentIndex,
  max,
  min = 1,
  onAdd,
  onSelect,
  onDelete,
  confirmDelete,
  errorIndexes,
  labels,
}: {
  count: number;
  currentIndex: number;
  max?: number;
  min?: number; // default 1
  onAdd: () => void;
  onSelect: (index: number) => void;
  onDelete?: (index: number) => void;
  confirmDelete?: (index: number) => boolean | Promise<boolean>;
  errorIndexes?: number[];
  labels?: (string | React.ReactNode)[];
}) {
  const canAdd = max === undefined || count < max;
  const canDelete = !!onDelete && count > min;

  function getLabel(i: number): string | React.ReactNode {
    return labels?.[i] ?? String(i + 1);
  }

  function getLabelText(i: number): string {
    const l = getLabel(i);
    return typeof l === "string" ? l : `Item ${i + 1}`;
  }

  async function handleDelete(index: number) {
    if (!onDelete || !canDelete) return;
    let ok = true;
    if (confirmDelete) {
      ok = await Promise.resolve(confirmDelete(index));
    } else {
      const labelText = getLabelText(index);
      ok = window.confirm?.(`Delete ${labelText}?`) ?? true;
    }
    if (ok) onDelete(index);
  }

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: count }).map((_, i) => {
        const hasError = errorIndexes?.includes(i);
        const label = getLabel(i);
        const labelText = getLabelText(i);

        return (
          <IndexButton
            key={i}
            index={i}
            label={label}
            active={i === currentIndex}
            hasError={hasError}
            onSelect={onSelect}
            onDelete={onDelete ? handleDelete : undefined}
            title={`${labelText}${onDelete ? " (right-click to delete)" : ""}`}
          />
        );
      })}

      {canAdd && (
        <IconButton
          icon="mingcute:add-line"
          size={28} // h-7 w-7
          variant="ghost" // keep it transparent; we’ll style via className
          onClick={onAdd}
          title="Add item"
          className="ml-1 border-2 border-[var(--color-bg4)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg3)]"
        />
      )}

      {onDelete && (
        <IconButton
          icon="mingcute:delete-2-line"
          size={28}
          variant="error"
          onClick={() => handleDelete(currentIndex)}
          disabled={!canDelete}
          title={
            canDelete
              ? `Delete current (${getLabelText(currentIndex)})`
              : `Cannot delete (min ${min})`
          }
          className={clsx(
            "ml-1",
            canDelete
              ? "hover:bg-[var(--color-error)]/5"
              : "border-[var(--color-error)]/50 text-[var(--color-error)]/50 cursor-not-allowed disabled:opacity-100"
          )}
        />
      )}
    </div>
  );
}
