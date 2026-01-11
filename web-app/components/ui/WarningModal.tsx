"use client";

import Button from "@/components/ui/buttons/Button";
import { Icon } from "@iconify/react/dist/iconify.js";

export default function WarningModal({
  open,
  title = "Are you sure?",
  message,
  cancelLabel = "Cancel",
  continueLabel = "Continue",
  onCancel,
  onContinue,
}: {
  open: boolean;
  title?: string;
  message?: string | React.ReactNode;
  cancelLabel?: string;
  continueLabel?: string;
  onCancel: () => void;
  onContinue: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40"
      role="dialog"
    >
      <div className="w-full max-w-md rounded-md bg-[var(--color-bg1)] p-4 shadow">
        <div className="mb-3 flex items-start gap-3">
          {/* Icon */}
          <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-error)]/15 text-[var(--color-error)]">
            <Icon icon="mingcute:alert-fill" className="h-5 w-5" />
          </div>

          <div className="flex-1">
            <h3
              id="warning-modal-title"
              className="mb-1 text-lg font-semibold text-[var(--color-text-primary)]"
            >
              {title}
            </h3>
            {message ? (
              <div className="text-sm text-[var(--color-text-secondary)]">
                {message}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} title={cancelLabel}>
            {cancelLabel}
          </Button>
          <Button
            variant="error"
            onClick={onContinue}
            title={continueLabel}
            className="hover:opacity-90"
          >
            {continueLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
