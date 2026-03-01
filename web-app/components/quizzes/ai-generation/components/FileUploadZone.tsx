import { Icon } from "@iconify/react";
import { useRef } from "react";

export type UploadDocumentType =
  | "syllabus"
  | "question-bank"
  | "subject-content"
  | "other";

export interface UploadedReferenceDocument {
  file: File;
  documentType: UploadDocumentType;
}

interface FileUploadZoneProps {
  documents: UploadedReferenceDocument[];
  maxFileSizeMb?: number;
  isDragging: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
}

function renderDocumentTypeLabel(type: UploadDocumentType): string {
  switch (type) {
    case "syllabus":
      return "Syllabus";
    case "question-bank":
      return "Question Bank";
    case "subject-content":
      return "Subject Content";
    default:
      return "Other";
  }
}

export default function FileUploadZone({
  documents,
  maxFileSizeMb = 20,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
  onRemoveFile,
}: FileUploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    if (selectedFiles.length > 0) {
      onFileSelect(selectedFiles);
    }
  };

  return (
    <div>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => documents.length < 5 && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
            : documents.length < 5
              ? "border-[var(--color-bg4)] hover:border-[var(--color-primary)]/50"
              : "border-[var(--color-bg4)] opacity-50 cursor-not-allowed"
        }`}
      >
        <Icon
          icon="mdi:cloud-upload"
          className="w-12 h-12 mx-auto mb-3 text-[var(--color-text-secondary)]"
        />
        {documents.length > 0 ? (
          <div>
            <p className="text-[var(--color-text-primary)] font-medium">
              {documents.length} file(s) selected
            </p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-2">
              {documents.length < 5
                ? "Click to add more files (max 5)"
                : "Maximum files reached"}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-[var(--color-text-primary)] font-medium">
              Drop reference documents here or click to browse
            </p>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              Supports PDF, DOCX, and TXT files (max {maxFileSizeMb}MB each, up
              to 5 files) - Optional
            </p>
          </div>
        )}
      </div>

      {documents.length > 0 && (
        <div className="mt-4 space-y-2">
          {documents.map((document, index) => (
            <div
              key={`${document.file.name}-${index}`}
              className="flex items-center justify-between p-3 bg-[var(--color-bg3)] rounded-lg"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Icon
                  icon="mdi:file-document"
                  className="w-5 h-5 text-[var(--color-primary)] flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--color-text-primary)] truncate font-medium">
                    {document.file.name}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {(document.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-[var(--color-bg4)] text-[var(--color-text-secondary)]">
                      {renderDocumentTypeLabel(document.documentType)}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemoveFile(index)}
                className="p-2 hover:bg-[var(--color-bg4)] rounded-lg transition-colors flex-shrink-0"
                title="Remove file"
              >
                <Icon
                  icon="mdi:close"
                  className="w-5 h-5 text-[var(--color-text-secondary)]"
                />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />
    </div>
  );
}
