"use client";

/**
 * ImageUpload Component
 *
 * Purpose:
 *   - Provides an interface for uploading, previewing, and deleting an image.
 *   - Handles client-side validation (file size), visual feedback, and notifies parent via callbacks.
 *
 * Props:
 *   @param {string} [fileName] - Optional display name of the currently attached file.
 *   @param {string} [initialUrl] - Optional initial URL for a pre-attached image.
 *   @param {(res: { ok: boolean; message: string; data?: { url: string; filename?: string; mimetype?: string; size?: number } }) => void} onUploaded
 *          - Called after an upload or removal attempt with status and metadata.
 *   @param {() => void} onDelete - Called when the user deletes the image.
 *
 * Internal State:
 *   - busy: boolean → true while uploading.
 *   - open: boolean → toggles preview visibility.
 *   - previewUrl: string|undefined → URL of uploaded or initial image.
 *   - error: string|null → error message if upload fails.
 *
 * Behavior / Logic:
 *   - pick(file):
 *       • Validates file presence and size (rejects > ALLOWED_FILE_SIZE).
 *       • Calls `uploadQuizImage(file)` and updates preview on success.
 *       • Calls `onUploaded` with structured result.
 *       • Resets input field so the same file can be re-selected.
 *   - handleDelete():
 *       • Clears preview and state, calls `onDelete` and `onUploaded({ ok: true, message: "Image removed" })`.
 *   - hasPreview flag used to toggle preview and extra controls.
 *
 * UI:
 *   - Left section: image icon + status text ("Uploading…", filename, "Image attached", or "No file").
 *   - "Upload image" button:
 *       • Wraps hidden `<input type="file">` (clicking triggers file picker).
 *   - Conditional buttons:
 *       • "Show preview"/"Hide preview" toggle.
 *       • "Delete" button (styled in error color).
 *   - Error message displayed below if validation/upload fails.
 *   - Image preview box shown when `open` is true.
 *
 * Styling:
 *   - Consistent with theme variables and using reusable <Button> component for actions.
 */

import Button from "@/components/ui/buttons/Button";
import { uploadQuizImage } from "@/services/quiz/actions/quiz-image-upload-action";
import { ImageMeta } from "@/services/quiz/types/quizTypes";
import { ALLOWED_FILE_SIZE } from "@/utils/utils";
import { Icon } from "@iconify/react";
import * as React from "react";

export default function ImageUpload({
  fileName,
  initialUrl,
  onUploaded,
  onDelete,
}: {
  fileName?: string;
  initialUrl?: string;
  onUploaded: (img: ImageMeta | null) => void;
  onDelete: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>(
    initialUrl
  );
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = "";
  };

  const pick = async (file: File | null) => {
    if (!file) {
      // no-op for parent; just clear local error & preview state
      setError(null);
      setPreviewUrl(undefined);
      resetInput();
      return;
    }

    // Client-side size check
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
    const res = await uploadQuizImage(file);
    setBusy(false);

    if (res.ok && res.data?.url) {
      // success → update preview + notify parent with ImageMeta
      setPreviewUrl(res.data.url);
      onUploaded(res.data as ImageMeta);
      setOpen(true);
    } else {
      // failure → stay local
      if (!res.ok) {
        setError(res.message ?? "Failed to upload image");
        setPreviewUrl(undefined);
      }
    }

    resetInput();
  };

  const handleDelete = () => {
    setPreviewUrl(undefined);
    setOpen(false);
    setError(null);
    onUploaded(null); // notify parent that form should clear its image field
    onDelete(); // optional side-effect (e.g., server cleanup)
    resetInput();
  };

  const hasPreview = !!previewUrl;

  return (
    <div className="flex flex-col gap-2 ml-2">
      <div className="flex items-center gap-3">
        <Icon icon="mingcute:pic-fill" />
        <span className="text-[var(--color-text-secondary)]">
          {busy
            ? "Uploading…"
            : fileName ?? (hasPreview ? "Image attached" : "No file")}
        </span>

        {/* Upload button that triggers hidden file input */}
        <Button
          variant="small"
          type="button"
          className="relative cursor-pointer"
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
              variant="small"
              type="button"
              onClick={() => setOpen((v) => !v)}
              title={open ? "Hide preview" : "Show preview"}
            >
              {open ? "Hide preview" : "Show preview"}
            </Button>
            <Button
              variant="small"
              type="button"
              onClick={handleDelete}
              className="bg-[var(--color-error)] text-white"
              title="Delete image"
            >
              Delete
            </Button>
          </>
        )}
      </div>

      {/* Local error display */}
      {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}

      {/* Preview */}
      {hasPreview && open && (
        <div className="rounded-md border border-[var(--color-bg4)] p-2 max-w-[420px]">
          {/* Using <img> for dynamic previews (blob/external) */}
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
