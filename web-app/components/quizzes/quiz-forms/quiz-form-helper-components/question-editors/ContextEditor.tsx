"use client";

import TextArea from "@/components/ui/text-inputs/TextArea";
/**
 * ContextEditor Component
 *
 * Purpose:
 *   - Provides an editor for adding contextual information (text + optional image)
 *     to be displayed before quiz questions.
 *
 * Props:
 *   @param {string} text - Current context text.
 *   @param {ImageMeta|null|undefined} image - Metadata for the uploaded image (or null if none).
 *   @param {(text: string) => void} onChangeText - Callback when context text changes.
 *   @param {(img: ImageMeta|null) => void} onSetImage - Callback when an image is uploaded.
 *
 * UI:
 *   - Label: "Context Text".
 *   - <textarea> for entering descriptive context, styled with app theme colors.
 *   - <ImageUpload> component:
 *       • Displays uploaded image preview (if provided).
 *
 */

import { ImageMeta } from "@/services/images/types";
import ImageUpload from "../../../../ImageUpload";
import { uploadQuizImage } from "@/services/quiz/actions/quiz-image-upload-action";

export default function ContextEditor({
  text,
  image,
  onChangeText,
  onSetImage,
  onDeleteImage,
}: {
  text: string;
  image: ImageMeta | null | undefined;
  onChangeText: (text: string) => void;
  onSetImage: (img: ImageMeta | null) => void;
  onDeleteImage: () => void;
}) {
  return (
    <div className="space-y-3 pt-2">
      <div className="mb-5 flex items-end justify-between">
        <label className="text-md text-[var(--color-text-primary)]">
          Context Text
        </label>
      </div>
      <TextArea
        value={text}
        onChange={onChangeText}
        placeholder="Add helpful context for the upcoming questions…"
      />
      <div className="mt-2">
        <ImageUpload
          uploadFn={uploadQuizImage}
          fileName={image?.filename}
          onUploaded={(meta) => onSetImage(meta)}
          initialUrl={image?.url}
          onDelete={onDeleteImage}
        />
      </div>
    </div>
  );
}
