"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/buttons/Button";
import IconButton from "@/components/ui/buttons/IconButton";
import { Icon } from "@iconify/react";

export type TutorialMedia = {
  src: string;
  type?: "image" | "video";
  alt?: string;
  poster?: string;
};

export type TutorialStep = {
  title: string;
  subtitle: string;
  media?: TutorialMedia;
};

function detectMediaType(src: string): "image" | "video" {
  const lower = src.toLowerCase();
  if (
    lower.endsWith(".mp4") ||
    lower.endsWith(".webm") ||
    lower.endsWith(".ogg")
  )
    return "video";
  return "image";
}

export default function TutorialModal({
  open,
  steps,
  onClose,
  startIndex = 0,
  nextLabel = "Next",
  backLabel = "Back",
  doneLabel = "Done",
  onOpenChange,
  triggerLabel,
  triggerIcon,
  triggerVariant = "ghost",
  triggerClassName,
  triggerTitle,
}: {
  open?: boolean;
  steps: TutorialStep[];
  onClose?: () => void;
  startIndex?: number;
  nextLabel?: string;
  backLabel?: string;
  doneLabel?: string;
  onOpenChange?: (next: boolean) => void;
  triggerLabel?: string;
  triggerIcon?: string;
  triggerVariant?: "primary" | "ghost" | "error" | "small";
  triggerClassName?: string;
  triggerTitle?: string;
}) {
  const isControlled = typeof open === "boolean";
  const [internalOpen, setInternalOpen] = useState(false);
  const [index, setIndex] = useState(startIndex);

  const isOpen = isControlled ? open! : internalOpen;

  useEffect(() => {
    if (isOpen) setIndex(startIndex);
  }, [isOpen, startIndex]);

  const stepCount = steps.length;
  const current = steps[index];

  const mediaType = useMemo(() => {
    if (!current?.media?.src) return null;
    return current.media.type || detectMediaType(current.media.src);
  }, [current?.media?.src, current?.media?.type]);

  const handleOpen = () => {
    if (!isControlled) setInternalOpen(true);
    onOpenChange?.(true);
  };

  const handleClose = () => {
    if (!isControlled) setInternalOpen(false);
    onOpenChange?.(false);
    onClose?.();
  };

  const triggerEl =
    triggerLabel || triggerIcon ? (
      <Button
        variant={triggerVariant}
        onClick={handleOpen}
        className={triggerClassName}
        title={triggerTitle}
      >
        {triggerLabel ? <span>{triggerLabel}</span> : null}
        {triggerIcon ? <Icon icon={triggerIcon} className="h-4 w-4" /> : null}
      </Button>
    ) : null;

  if (!isOpen || !current) {
    return triggerEl;
  }

  const isFirst = index === 0;
  const isLast = index === stepCount - 1;

  return (
    <>
      {triggerEl}
      <div
        className="fixed inset-0 z-[110] grid place-items-center bg-black/40"
        role="dialog"
      >
        <div className="w-[92vw] max-w-6xl rounded-2xl bg-[var(--color-bg1)] p-6 shadow">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
                Step {index + 1} of {stepCount}
              </div>
              <h3 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
                {current.title}
              </h3>
            </div>
            <IconButton
              icon="mdi:close"
              variant="borderless"
              size="sm"
              title="Close tutorial"
              onClick={handleClose}
            />
          </div>

          {current.media?.src ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-[var(--color-bg3)] bg-[var(--color-bg2)]/50">
              {mediaType === "video" ? (
                <video
                  src={current.media.src}
                  poster={current.media.poster}
                  autoPlay
                  muted
                  loop
                  controls
                  playsInline
                  className="h-full w-full max-h-[600px] object-contain"
                />
              ) : (
                <img
                  src={current.media.src}
                  alt={current.media.alt || current.title}
                  className="h-full w-full max-h-[600px] object-contain"
                  loading="lazy"
                  decoding="async"
                />
              )}
            </div>
          ) : null}

          <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
            {current.subtitle}
          </p>

          <div className="mt-6 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={isFirst}
            >
              {backLabel}
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                onClick={() =>
                  isLast
                    ? handleClose()
                    : setIndex((i) => Math.min(stepCount - 1, i + 1))
                }
              >
                {isLast ? doneLabel : nextLabel}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
