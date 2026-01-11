"use client";

/**
 * EditableField Component
 *
 * Purpose:
 *   - Provides a reusable wrapper for form fields that can be locked, edited, or saved.
 *   - Supports read-only mode, error display, and async save actions.
 *
 * Props:
 *   @param {string} label - Label displayed above the field.
 *   @param {boolean} locked - If true, field is locked and shows "Edit" button only.
 *   @param {boolean} [readOnly=false] - If true, hides action buttons and prevents editing.
 *   @param {boolean} [saving=false] - Indicates if save operation is in progress.
 *   @param {string | string[]} [error] - Error message(s) to display under the field.
 *   @param {() => void} onEdit - Callback when user clicks "Edit".
 *   @param {() => void | Promise<void>} onSave - Callback when user clicks "Save".
 *   @param {() => void} onCancel - Callback when user clicks "Cancel".
 *   @param {React.ReactNode} children - The input or content element being edited.
 *
 * Key Features:
 *   - Displays "Edit" button when locked.
 *   - Displays "Save" (with loading) and "Cancel" buttons when unlocked.
 *   - Respects `readOnly` flag to disable all action buttons.
 *   - Shows error messages below the field (supports single or multiple errors).
 *
 * UI:
 *   - Label + field content area.
 *   - Action buttons aligned to the right.
 *   - Optional error text styled in red.
 */

import Button from "@/components/ui/buttons/Button";
import React from "react";

type Props = {
  label: string;
  locked: boolean;
  readOnly?: boolean;
  saving?: boolean;
  error?: string | string[];
  onEdit: () => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  children: React.ReactNode;
};

export default function EditableField({
  label,
  locked,
  readOnly = false,
  saving = false,
  error,
  onEdit,
  onSave,
  onCancel,
  children,
}: Props) {
  return (
    <div className="mb-6 flex flex-col">
      <label className="text-sm text-[var(--color-text-primary)] mb-2">
        {label}
      </label>

      <div className="flex items-start h-full gap-2">
        <div className="flex-col flex-1 min-w-0">
          <div className="flex-1 min-w-0">{children}</div>
          {!!error && (
            <p className="mt-3 text-xs text-[var(--color-error)]">
              {Array.isArray(error) ? error.join(", ") : error}
            </p>
          )}
        </div>

        {!readOnly && (
          <div className="w-[190px] h-full">
            {locked ? (
              <div className="flex gap-2 h-full mt-1">
                <Button onClick={onEdit}>Edit</Button>
              </div>
            ) : (
              <div className="flex gap-2 h-full mt-1">
                <Button
                  onClick={onSave}
                  loading={saving}
                  className="bg-[var(--color-success)] text-white hover:opacity-90"
                >
                  Save
                </Button>
                <Button variant="ghost" onClick={onCancel} disabled={saving}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
