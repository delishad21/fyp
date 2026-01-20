"use client";

import Button from "@/components/ui/buttons/Button";
import { uploadQuizImage } from "@/services/quiz/actions/quiz-image-upload-action"; // fallback for backward-compat
import { ImageMeta } from "@/services/images/types";
import { ALLOWED_FILE_SIZE } from "@/utils/utils";
import { Icon } from "@iconify/react";
import * as React from "react";

type UploadFn = (
  file: File
) => Promise<{ ok: boolean; message?: string; data?: ImageMeta }>;

export default function ImageUpload({
  fileName,
  initialUrl,
  onUploaded,
  onDelete,
  uploadFn,
}: {
  fileName?: string;
  initialUrl?: string;
  onUploaded: (img: ImageMeta | null) => void;
  onDelete: () => void;
  uploadFn: UploadFn;
}) {
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>(
    initialUrl
  );
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // Sync local state when the question changes (i.e. initialUrl changes)
  React.useEffect(() => {
    setPreviewUrl(initialUrl);
    setOpen(!!initialUrl); // open preview automatically if there *is* an image
    setError(null); // clear any old upload error when switching questions
  }, [initialUrl]);

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = "";
  };

  const pick = async (file: File | null) => {
    if (!file) {
      setError(null);
      setPreviewUrl(undefined);
      resetInput();
      return;
    }

    if (file.size > ALLOWED_FILE_SIZE) {
      setError(
        `File is too large (max ${ALLOWED_FILE_SIZE / 1024 / 1024} MB).`
      );
      setPreviewUrl(undefined);
      resetInput();
      return;
    }

    setBusy(true);
    setError(null);

    const doUpload = uploadFn ?? uploadQuizImage;

    const res = await doUpload(file);
    setBusy(false);

    if (res.ok && res.data?.url) {
      setPreviewUrl(res.data.url);
      onUploaded(res.data as ImageMeta);
      setOpen(true);
    } else {
      setError(res.message ?? "Failed to upload image");
      setPreviewUrl(undefined);
    }

    resetInput();
  };

  const handleDelete = () => {
    setPreviewUrl(undefined);
    setOpen(false);
    setError(null);
    onUploaded(null);
    onDelete();
    resetInput();
  };

  const hasPreview = !!previewUrl;

  return (
    <div className="flex flex-col gap-2 ml-2">
      <div className="flex items-center gap-3">
        <Icon icon="mingcute:pic-fill" className="text-xl" />
        <div className="flex flex-col min-w-0">
          <span className="text-[var(--color-text-primary)] text-sm">
            Image (optional)
          </span>
          <span className="text-[var(--color-text-secondary)] text-xs truncate max-w-[220px]">
            {busy
              ? "Uploading…"
              : fileName ?? (hasPreview ? "Image attached" : "No file")}
          </span>
        </div>

        <Button
          variant="ghost"
          type="button"
          className="relative cursor-pointer px-4 py-2 text-sm"
        >
          Upload image
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={(e) => pick(e.currentTarget.files?.[0] ?? null)}
          />
        </Button>

        {hasPreview && (
          <>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setOpen((v) => !v)}
              title={open ? "Hide preview" : "Show preview"}
              className="px-4 py-2 text-sm"
            >
              {open ? "Hide preview" : "Show preview"}
            </Button>
            <Button
              variant="error"
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 text-sm"
              title="Delete image"
            >
              Delete
            </Button>
          </>
        )}
      </div>

      {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}

      {hasPreview && open && (
        <div className="rounded-md border border-[var(--color-bg4)] p-2 max-w-[420px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Uploaded preview"
            className="max-h-64 w-auto rounded"
          />
        </div>
      )}
    </div>
  );
}
