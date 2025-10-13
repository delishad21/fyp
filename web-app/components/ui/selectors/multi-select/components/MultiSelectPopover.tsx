"use client";

/**
 *   - Provides the styled container for the dropdown menu.
 *   - Wraps the list, search bar, and footer actions.
 */

export function MultiSelectPopover({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute z-10 mt-2 w-full rounded-xl border border-[var(--color-bg3)] bg-[var(--color-bg1)] p-2 shadow-lg"
      style={{ boxShadow: "var(--drop-shadow)" }}
      role="listbox"
    >
      {children}
    </div>
  );
}
