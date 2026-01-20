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
 *       - Optional confirmation hook before deletion. If provided, this is used instead of the WarningModal.
 *   @param {number[]} [errorIndexes] - List of indexes that should be styled as error states.
 *   @param {(string|React.ReactNode)[]} [labels] - Optional custom labels per item; defaults to "1", "2", ...
 *   @param {(fromIndex: number, toIndex: number) => void} [onReorder] - Optional handler to reorder items via drag/drop.
 *
 * Behavior:
 *   - Renders a row of circular buttons (1 per item).
 *   - Current item -> primary color.
 *   - Items with errors -> error color.
 *   - Others -> neutral background with hover highlight.
 *   - Left-click -> select item.
 *   - Right-click (context menu) -> delete item (if `onDelete` provided).
 *   - Drag + drop -> reorder items (if `onReorder` provided).
 *   - Add button (+) appears if under max limit.
 *   - Dedicated delete button (trash icon) deletes the current item,
 *     disabled if count <= min.
 */

import { useState } from "react";
import IconButton from "@/components/ui/buttons/IconButton";
import IndexButton from "@/components/ui/buttons/IndexButton";
import clsx from "clsx";
import WarningModal from "@/components/ui/WarningModal";
import { LayoutGroup, motion } from "framer-motion";

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
  ids,
  onReorder,
  direction = "horizontal",
  layout = "row",
  gridRows = 10,
  controlsPosition = "bottom",
  addInline = false,
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
  ids?: string[];
  onReorder?: (fromIndex: number, toIndex: number) => void;
  direction?: "horizontal" | "vertical";
  layout?: "row" | "grid";
  gridRows?: number;
  controlsPosition?: "top" | "bottom" | "none";
  addInline?: boolean;
}) {
  const canAdd = max === undefined || count < max;
  const canDelete = !!onDelete && count > min;
  const dragEnabled = typeof onReorder === "function" && count > 1;
  const isVertical = direction === "vertical";
  const isGrid = layout === "grid";

  // Which index are we currently asking to delete via WarningModal?
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(
    null
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<number | null>(null);

  function getLabel(i: number): string | React.ReactNode {
    return labels?.[i] ?? String(i + 1);
  }

  function getLabelText(i: number): string {
    const l = getLabel(i);
    return typeof l === "string" ? l : `Item ${i + 1}`;
  }

  function requestDelete(index: number) {
    if (!onDelete || !canDelete) return;

    if (confirmDelete) {
      // If the parent provided a custom confirm hook, use that instead of the modal.
      Promise.resolve(confirmDelete(index)).then((ok) => {
        if (ok) onDelete(index);
      });
    } else {
      // Open the WarningModal for this index.
      setPendingDeleteIndex(index);
    }
  }

  function handleCancelModal() {
    setPendingDeleteIndex(null);
  }

  function handleConfirmModal() {
    if (pendingDeleteIndex === null || !onDelete) {
      setPendingDeleteIndex(null);
      return;
    }
    const idx = pendingDeleteIndex;
    setPendingDeleteIndex(null);
    onDelete(idx);
  }

  function getDataTransfer(e: unknown): DataTransfer | null {
    return "dataTransfer" in (e as { dataTransfer?: DataTransfer })
      ? ((e as { dataTransfer?: DataTransfer }).dataTransfer ?? null)
      : null;
  }

  function hideDragImage(dataTransfer: DataTransfer | null) {
    if (!dataTransfer) return;
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
    dataTransfer.setDragImage(img, 0, 0);
  }

  function resolveDropIndex(from: number, position: number, total: number) {
    const clampedPos = Math.max(0, Math.min(position, total));
    if (clampedPos <= from) return clampedPos;
    return clampedPos - 1;
  }

  function handleHoverPosition(position: number) {
    if (!dragEnabled || dragIndex === null) return;
    const nextIndex = resolveDropIndex(dragIndex, position, count);
    if (nextIndex === dragIndex) {
      if (dropPosition !== position) setDropPosition(position);
      return;
    }
    onReorder?.(dragIndex, nextIndex);
    setDragIndex(nextIndex);
    setDropPosition(position);
  }

  const controls = (
    <div
      className={clsx(
        "flex items-center gap-2",
        isGrid ? "justify-start" : isVertical ? "justify-center" : "justify-start"
      )}
    >
      {canAdd && (
        <IconButton
          icon="mingcute:add-line"
          size={40}
          variant="ghost" // keep it transparent; we’ll style via className
          onClick={onAdd}
          title="Add item"
          className="border-2 border-[var(--color-bg4)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg3)]"
        />
      )}

      {onDelete && (
        <IconButton
          icon="mingcute:delete-2-line"
          size={28}
          variant="error"
          onClick={() => requestDelete(currentIndex)}
          disabled={!canDelete}
          title={
            canDelete
              ? `Delete current (${getLabelText(currentIndex)})`
              : `Cannot delete (min ${min})`
          }
          className={clsx(
            canDelete
              ? "hover:bg-[var(--color-error)]/5"
              : "border-[var(--color-error)]/50 text-[var(--color-error)]/50 cursor-not-allowed disabled:opacity-100"
          )}
        />
      )}
    </div>
  );

  return (
    <>
      {controlsPosition === "top" && controls}
      {isGrid ? (
        <LayoutGroup>
          <div
            className={clsx(
              "flex gap-2",
              isVertical ? "items-start" : "flex-col items-start"
            )}
          >
            {Array.from({
              length:
                Math.max(1, Math.ceil(count / gridRows)) +
                (addInline && canAdd && count % gridRows === 0 ? 1 : 0),
            }).map((_, groupIndex, groups) => {
              const start = groupIndex * gridRows;
              const end = Math.min(start + gridRows, count);
              const groupItems = Array.from(
                { length: end - start },
                (_, idx) => start + idx
              );
              const isLastGroup = groupIndex === groups.length - 1;

              const renderDropZone = (position: number) => (
                <div
                  key={`drop-${position}`}
                  onDragOver={(e) => {
                    if (!dragEnabled || dragIndex === null) return;
                    e.preventDefault();
                    const dataTransfer = getDataTransfer(e);
                    if (dataTransfer) dataTransfer.dropEffect = "move";
                    handleHoverPosition(position);
                  }}
                  onDrop={(e) => {
                    if (!dragEnabled || dragIndex === null) return;
                    e.preventDefault();
                    setDragIndex(null);
                    setDropPosition(null);
                  }}
                  className={clsx(
                    "flex items-center justify-center",
                    isVertical ? "h-3 w-10" : "h-10 w-3"
                  )}
                >
                  <span
                    className={clsx(
                      "rounded-full transition-colors",
                      isVertical ? "h-0.5 w-6" : "h-6 w-0.5",
                      dragEnabled &&
                        dragIndex !== null &&
                        dropPosition === position
                        ? "bg-[var(--color-primary)]"
                        : "bg-transparent"
                    )}
                  />
                </div>
              );

              return (
                <div
                  key={`group-${groupIndex}`}
                  className={clsx(
                    "flex items-center gap-1",
                    isVertical ? "flex-col" : "flex-row"
                  )}
                >
                  {groupItems.map((i) => {
                    const hasError = errorIndexes?.includes(i);
                    const label = getLabel(i);
                    const labelText = getLabelText(i);
                    const key = ids?.[i] ?? String(i);

                    return (
                      <div
                        key={`item-${key}`}
                        className={clsx(
                          "flex items-center",
                          isVertical ? "flex-col" : "flex-row"
                        )}
                      >
                        {renderDropZone(i)}
                        <motion.div
                          layout
                          draggable={dragEnabled}
                          onDragStart={(e) => {
                            if (!dragEnabled) return;
                            const dataTransfer = getDataTransfer(e);
                            if (!dataTransfer) return;
                            setDragIndex(i);
                            setDropPosition(i);
                            dataTransfer.effectAllowed = "move";
                            dataTransfer.setData("text/plain", String(i));
                            hideDragImage(dataTransfer);
                          }}
                          onDragOver={(e) => {
                            if (!dragEnabled || dragIndex === null) return;
                            e.preventDefault();
                            const rect =
                              e.currentTarget.getBoundingClientRect();
                            const midpoint = isVertical
                              ? rect.top + rect.height / 2
                              : rect.left + rect.width / 2;
                            const nextPosition = isVertical
                              ? e.clientY < midpoint
                                ? i
                                : i + 1
                              : e.clientX < midpoint
                              ? i
                              : i + 1;
                            handleHoverPosition(nextPosition);
                          }}
                          onDrop={(e) => {
                            if (!dragEnabled || dragIndex === null) return;
                            e.preventDefault();
                            setDragIndex(null);
                            setDropPosition(null);
                          }}
                          onDragEnd={() => {
                            if (!dragEnabled) return;
                            setDragIndex(null);
                            setDropPosition(null);
                          }}
                          className={clsx(
                            "rounded-full",
                            dragEnabled && "cursor-grab active:cursor-grabbing",
                            dragEnabled && dragIndex === i && "opacity-60"
                          )}
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 40,
                          }}
                        >
                          <IndexButton
                            index={i}
                            label={label}
                            active={i === currentIndex}
                            hasError={hasError}
                            onSelect={onSelect}
                            onDelete={onDelete ? requestDelete : undefined}
                            title={`${labelText}${
                              dragEnabled ? " (drag to reorder)" : ""
                            }${onDelete ? " (right-click to delete)" : ""}`}
                          />
                        </motion.div>
                      </div>
                    );
                  })}
                  {renderDropZone(end)}
                  {addInline && canAdd && isLastGroup && (
                    <motion.div
                      layout
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 40,
                      }}
                      className={isVertical ? "-mt-1" : ""}
                    >
                      <IconButton
                        icon="mingcute:add-line"
                        size={40}
                        variant="ghost"
                        onClick={onAdd}
                        title="Add item"
                        className="border-2 border-dashed border-[var(--color-bg4)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg3)]"
                      />
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        </LayoutGroup>
      ) : (
        <div
          className={clsx(
            "flex",
            isVertical
              ? "flex-col items-center gap-2"
              : "flex-wrap items-center gap-2"
          )}
        >
          {Array.from({ length: count + 1 }).map((_, position) => {
            const isActive =
              dragEnabled && dragIndex !== null && dropPosition === position;

            return (
              <div
                key={`drop-${position}`}
                onDragOver={(e) => {
                  if (!dragEnabled || dragIndex === null) return;
                  e.preventDefault();
                  const dataTransfer = getDataTransfer(e);
                  if (dataTransfer) dataTransfer.dropEffect = "move";
                  if (dropPosition !== position) setDropPosition(position);
                }}
                onDrop={(e) => {
                  if (!dragEnabled || dragIndex === null) return;
                  e.preventDefault();
                  const from = dragIndex;
                  const to = resolveDropIndex(from, position, count);
                  setDragIndex(null);
                  setDropPosition(null);
                  if (from === to) return;
                  onReorder?.(from, to);
                }}
                className={clsx(
                  "flex items-center",
                  isVertical ? "flex-col" : "flex-row"
                )}
              >
                <span
                  className={clsx(
                    "rounded-full transition-colors",
                    isVertical ? "h-1 w-8" : "h-8 w-1",
                    isActive
                      ? "bg-[var(--color-primary)]"
                      : "bg-transparent"
                  )}
                />
                {position < count && (() => {
                  const i = position;
                  const hasError = errorIndexes?.includes(i);
                  const label = getLabel(i);
                  const labelText = getLabelText(i);

                  return (
                    <div
                      draggable={dragEnabled}
                      onDragStart={(e) => {
                        if (!dragEnabled) return;
                        const dataTransfer = getDataTransfer(e);
                        if (!dataTransfer) return;
                        setDragIndex(i);
                        setDropPosition(i);
                        dataTransfer.effectAllowed = "move";
                        dataTransfer.setData("text/plain", String(i));
                      }}
                      onDragEnd={() => {
                        if (!dragEnabled) return;
                        setDragIndex(null);
                        setDropPosition(null);
                      }}
                      className={clsx(
                        "rounded-full",
                        dragEnabled && "cursor-grab active:cursor-grabbing",
                        dragEnabled && dragIndex === i && "opacity-60"
                      )}
                    >
                      <IndexButton
                        index={i}
                        label={label}
                        active={i === currentIndex}
                        hasError={hasError}
                        onSelect={onSelect}
                        onDelete={onDelete ? requestDelete : undefined}
                        title={`${labelText}${
                          dragEnabled ? " (drag to reorder)" : ""
                        }${onDelete ? " (right-click to delete)" : ""}`}
                      />
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
      {controlsPosition === "bottom" && controls}

      {/* Warning modal for delete confirmation (used when confirmDelete is not provided) */}
      <WarningModal
        open={pendingDeleteIndex !== null}
        title="Delete item?"
        message={
          pendingDeleteIndex !== null
            ? `Are you sure you want to delete ${getLabelText(
                pendingDeleteIndex
              )}?`
            : undefined
        }
        cancelLabel="Cancel"
        continueLabel="Delete"
        onCancel={handleCancelModal}
        onContinue={handleConfirmModal}
      />
    </>
  );
}
