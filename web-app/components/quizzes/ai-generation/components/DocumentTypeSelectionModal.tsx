"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/buttons/Button";
import Select from "@/components/ui/selectors/select/Select";
import { Icon } from "@iconify/react";
import { UploadDocumentType } from "./FileUploadZone";

interface DocumentTypeSelectionModalProps {
  open: boolean;
  file: File | null;
  value: UploadDocumentType;
  onChange: (value: UploadDocumentType) => void;
  onConfirm: () => void;
  onSkip: () => void;
}

const TYPE_DESCRIPTIONS: Record<UploadDocumentType, string> = {
  syllabus:
    "Curriculum standards, learning outcomes, or official level/topic expectations.",
  "question-bank":
    "Past-year papers, worksheets, assessment banks, or exemplar question sets.",
  "subject-content":
    "Textbook chapters, lesson notes, or concept explanations for factual grounding.",
  other: "Mixed or uncategorized references. Used as supplementary context.",
};

export default function DocumentTypeSelectionModal({
  open,
  file,
  value,
  onChange,
  onConfirm,
  onSkip,
}: DocumentTypeSelectionModalProps) {
  const [previewText, setPreviewText] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string>("");

  const previewMode = useMemo<"text" | "pdf" | "none">(() => {
    if (!file) return "none";
    const name = file.name.toLowerCase();

    const isText =
      file.type === "text/plain" ||
      name.endsWith(".txt") ||
      name.endsWith(".md");
    if (isText) return "text";

    const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
    if (isPdf) return "pdf";

    return "none";
  }, [file]);

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      if (!open || !file || previewMode !== "text") {
        setPreviewText("");
        return;
      }

      setIsLoadingPreview(true);
      try {
        const raw = await file.text();
        if (cancelled) return;
        const normalized = raw.replace(/\r\n/g, "\n").trim();
        setPreviewText(
          normalized.length > 3500
            ? `${normalized.slice(0, 3500).trim()}\n\n...`
            : normalized,
        );
      } catch {
        if (!cancelled) setPreviewText("Unable to preview this file.");
      } finally {
        if (!cancelled) setIsLoadingPreview(false);
      }
    }

    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [open, file, previewMode]);

  useEffect(() => {
    if (!open || !file || previewMode !== "pdf") {
      setPdfPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPdfPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [open, file, previewMode]);

  if (!open || !file) return null;

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-5xl rounded-xl bg-[var(--color-bg1)] border border-[var(--color-bg4)] shadow-xl">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-[var(--color-bg4)]">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
              <Icon
                icon="mingcute:file-2-line"
                className="w-5 h-5 text-[var(--color-primary)]"
              />
              Select Document Type
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1 truncate">
              {file.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="p-2 rounded-md hover:bg-[var(--color-bg3)] transition-colors"
            title="Skip this file"
          >
            <Icon
              icon="mingcute:close-line"
              className="w-5 h-5 text-[var(--color-text-secondary)]"
            />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 p-5">
          <div className="lg:col-span-3 rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4 min-h-[320px]">
            <div className="mb-3 flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
              <span>Preview</span>
              <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
            {previewMode === "text" ? (
              isLoadingPreview ? (
                <div className="h-[260px] flex items-center justify-center text-[var(--color-text-secondary)]">
                  <Icon icon="mdi:loading" className="w-5 h-5 animate-spin" />
                </div>
              ) : (
                <pre className="text-xs leading-5 whitespace-pre-wrap break-words text-[var(--color-text-primary)] max-h-[340px] overflow-auto">
                  {previewText || "No preview text available."}
                </pre>
              )
            ) : previewMode === "pdf" ? (
              <div className="h-[340px] overflow-hidden rounded-md border border-[var(--color-bg4)]">
                {pdfPreviewUrl ? (
                  <iframe
                    src={pdfPreviewUrl}
                    title={`Preview ${file.name}`}
                    className="w-full h-full bg-white"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-[var(--color-text-secondary)]">
                    <Icon icon="mdi:loading" className="w-5 h-5 animate-spin" />
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[260px] flex flex-col items-center justify-center text-center text-[var(--color-text-secondary)] px-4">
                <Icon icon="mingcute:doc-line" className="w-8 h-8 mb-2" />
                <p className="text-sm">
                  Preview is available for PDF and TXT/MD files only.
                </p>
                <p className="text-xs mt-1">
                  File type: {file.type || "Unknown"} • Extension:{" "}
                  {file.name.split(".").pop() || "n/a"}
                </p>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-3">
            <Select
              id="documentType"
              name="documentType"
              label="Document Type"
              options={[
                { label: "Syllabus", value: "syllabus" },
                { label: "Question Bank / Past Paper", value: "question-bank" },
                { label: "Subject Content", value: "subject-content" },
                { label: "Other", value: "other" },
              ]}
              value={value}
              onChange={(next) => onChange(next as UploadDocumentType)}
              required
              className="min-w-0"
            />

            <div className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                What This Type Means
              </p>
              <div className="space-y-2 text-xs leading-5 text-[var(--color-text-secondary)]">
                <p>
                  <span className="font-medium text-[var(--color-text-primary)]">
                    Syllabus:
                  </span>{" "}
                  Use this for curriculum goals and what students should learn
                  at this level.
                </p>
                <p>
                  <span className="font-medium text-[var(--color-text-primary)]">
                    Question Bank / Past Paper:
                  </span>{" "}
                  Use this for example question styles and assessment difficulty.
                </p>
                <p>
                  <span className="font-medium text-[var(--color-text-primary)]">
                    Subject Content:
                  </span>{" "}
                  Use this for textbook or lesson content that the quiz should
                  be based on.
                </p>
                <p>
                  <span className="font-medium text-[var(--color-text-primary)]">
                    Other:
                  </span>{" "}
                  Use this for extra references that do not fit the above types.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              Upload only content related to your requested topic. Irrelevant
              documents can cause the generated quizzes to become less focused.
            </div>

            <p className="text-xs text-[var(--color-text-secondary)] leading-5">
              Selected type purpose: {TYPE_DESCRIPTIONS[value]}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-[var(--color-bg4)]">
          <Button type="button" variant="ghost" onClick={onSkip}>
            Skip File
          </Button>
          <Button type="button" onClick={onConfirm}>
            Save Document Type
          </Button>
        </div>
      </div>
    </div>
  );
}
