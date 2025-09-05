"use client";

/**
 * Pagination Component
 *
 * Purpose:
 *   - Provides UI for navigating through paginated data sets.
 *   - Supports step-by-step navigation and jumping 5 pages at a time.
 *
 * Props:
 *   @param {number} page        Current active page (1-based).
 *   @param {number} pageCount   Total number of pages.
 *   @param {(page: number) => void} onPageChange
 *                                Callback fired when a page is selected.
 *
 * Behavior:
 *   - Hides itself if only 1 page exists.
 *   - Shows up to 5 page numbers in a window around the current page.
 *   - Includes buttons for previous/next and ±5 page jumps.
 *   - Highlights the active page.
 */

import IconButton from "../ui/buttons/IconButton";
import IndexButton from "../ui/buttons/IndexButton";

function window5(current: number, total: number): number[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 4, 5];
  if (current >= total - 2)
    return [total - 4, total - 3, total - 2, total - 1, total];
  return [current - 2, current - 1, current, current + 1, current + 2];
}

export default function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const pages = window5(page, pageCount);
  const go = (p: number) => onPageChange(Math.min(Math.max(1, p), pageCount));

  return (
    <div className="flex w-full items-center justify-end gap-2">
      <IconButton
        icon="mingcute:arrows-left-line"
        variant="pagination"
        size="sm"
        title="Back 5 pages"
        onClick={() => go(page - 5)}
        disabled={page === 1}
      />
      <IconButton
        icon="mingcute:left-line"
        variant="pagination"
        size="sm"
        title="Previous page"
        onClick={() => go(page - 1)}
        disabled={page === 1}
      />

      {pages.map((p) => (
        <IndexButton
          key={p}
          index={p}
          label={p}
          active={p === page}
          title={`Page ${p}`}
          onSelect={(i) => go(i)}
          variant="pagination"
        />
      ))}

      <IconButton
        icon="mingcute:right-line"
        variant="pagination"
        size="sm"
        title="Next page"
        onClick={() => go(page + 1)}
        disabled={page === pageCount}
      />
      <IconButton
        icon="mingcute:arrows-right-line"
        variant="pagination"
        size="sm"
        title="Forward 5 pages"
        onClick={() => go(page + 5)}
        disabled={page === pageCount}
      />

      <div className="ml-1 text-sm text-[var(--color-text-secondary)]">
        of {pageCount}
      </div>
    </div>
  );
}
