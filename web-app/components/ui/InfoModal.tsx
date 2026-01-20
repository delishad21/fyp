"use client";

import Button from "@/components/ui/buttons/Button";
import { Icon } from "@iconify/react";

export default function InfoModal({
  open,
  title = "Info",
  message,
  closeLabel = "Close",
  onClose,
}: {
  open: boolean;
  title?: string;
  message?: string | React.ReactNode;
  closeLabel?: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-md bg-[var(--color-bg1)] p-4 shadow">
        <div className="mb-3 flex items-start gap-3">
          <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
            <Icon icon="mingcute:information-line" className="h-5 w-5" />
          </div>

          <div className="flex-1">
            <h3 className="mb-1 text-lg font-semibold text-[var(--color-text-primary)]">
              {title}
            </h3>
            {message ? (
              <div className="text-sm text-[var(--color-text-secondary)]">
                {message}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose} title={closeLabel}>
            {closeLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
