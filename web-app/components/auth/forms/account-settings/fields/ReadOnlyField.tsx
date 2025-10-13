"use client";

/**
 * ReadOnlyField Component
 *
 * Purpose:
 *   - Readonly counterpart to editable field. Used for displaying non-editable values with
 *   - a similar style to the EditableField.
 *   - Displays a labeled field in a consistent layout with no editing controls.
 *   - Maintains alignment with `EditableField` by reserving space for action buttons.
 *
 * Props:
 *   @param {string} label - Label displayed above the field.
 *   @param {React.ReactNode} children - The field content (read-only value).
 *
 * Key Features:
 *   - Consistent spacing and styling with editable fields.
 *   - Right-side column preserved for alignment with other field types.
 *   - Ideal for displaying values that should not be edited.
 *
 * UI:
 *   - Label text above.
 *   - Field content area below (children).
 *   - Empty button column to align with editable fields.
 */

export default function ReadOnlyField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col">
      <label className="text-sm text-[var(--color-text-primary)] mb-2">
        {label}
      </label>
      <div className="flex items-start h-[45px] gap-2">
        <div className="flex-1 min-w-0">{children}</div>
        <div className="w-[190px] h-full" /> {/* keep column for alignment */}
      </div>
    </div>
  );
}
