// components/quizzes/quiz-view/QuizViewHeader.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Select from "@/components/ui/selectors/select/Select";
import IconButton from "@/components/ui/buttons/IconButton";
import WarningModal from "@/components/ui/WarningModal";
import { deleteQuizAction } from "@/services/quiz/actions/delete-quiz-action";
import { normalizeHex } from "@/services/class/helpers/class-helpers";

type Props = {
  quizId: string;
  quizType: "basic" | "rapid" | "crossword" | string;
  name: string;
  subject: string;
  topic: string;
  versions: number[];
  currentVersion: number;
  subjectColorHex: string;
  typeColorHex: string;
  /** Total time in seconds (Basic / Crossword) */
  totalTimeLimit?: number | null;
};

/** Simple display helper: 75m 30s, 10m, 45s, etc. */
function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m && rem) return `${m}m ${rem}s`;
  if (m) return `${m}m`;
  return `${rem}s`;
}

export default function QuizViewHeader({
  quizId,
  quizType,
  name,
  subject,
  topic,
  versions,
  currentVersion,
  subjectColorHex,
  typeColorHex,
  totalTimeLimit,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const subjectColor = normalizeHex(subjectColorHex);
  const typeColor = normalizeHex(typeColorHex);
  const totalTimeLabel =
    totalTimeLimit != null ? formatDuration(totalTimeLimit) : null;

  const versionOptions = versions.map((v) => ({
    value: String(v),
    label: `Version ${v}`,
  }));

  const handleVersionChange = (val: string) => {
    const sp = new URLSearchParams(searchParams?.toString() || "");
    if (val) sp.set("version", val);
    else sp.delete("version");
    router.push(`/quizzes/view/${encodeURIComponent(quizId)}?${sp.toString()}`);
  };

  const handleEdit = () => {
    router.push(`/quizzes/edit/${encodeURIComponent(quizId)}`);
  };

  const handleDuplicate = () => {
    const base = `/quizzes/create/${encodeURIComponent(quizType)}`;
    const sp = new URLSearchParams();
    sp.set("from", quizId);
    if (currentVersion) sp.set("version", String(currentVersion));
    router.push(`${base}?${sp.toString()}`);
  };

  const openDeleteModal = () => setConfirmOpen(true);
  const cancelDelete = () => setConfirmOpen(false);

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await deleteQuizAction(String(quizId));
      if (!res.ok) {
        // swap for toast if you prefer
        alert(res.message || "Failed to delete quiz.");
        return;
      }
      router.push("/quizzes");
    } finally {
      setIsDeleting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg bg-[var(--color-bg3)] px-7 py-5 text-[var(--color-text-primary)] md:flex-row md:items-start md:justify-between">
        {/* LEFT: title + meta */}
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-xl font-bold">{name || "Untitled Quiz"}</h1>

          {/* Subject dot + label */}
          <span className="flex items-center gap-2 leading-none">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{
                background: subjectColor ?? "var(--color-primary)",
              }}
              title={subject}
            />
            <span className="font-semibold" title={subject}>
              {subject || "—"}
            </span>
          </span>

          {/* Topic */}
          <div className="text-md text-[var(--color-text-secondary)]">
            {topic || "—"}
          </div>

          {/* Type pill */}
          <span
            className="inline-flex w-fit items-center rounded-full px-2.5 py-1.5 text-xs font-semibold capitalize"
            style={{
              color: "var(--color-text-primary)",
              background: typeColor ?? "var(--color-bg4)",
            }}
            title={quizType}
          >
            {quizType}
          </span>

          {/* Time limit (if any) */}
          {totalTimeLabel && (
            <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Time limit:{" "}
              <span className="font-semibold text-[var(--color-text-primary)]">
                {totalTimeLabel}
              </span>
            </div>
          )}
        </div>

        {/* RIGHT: version selector + actions */}
        <div className="flex flex-col items-end gap-3 md:w-[360px]">
          {/* Version selector */}
          <div className="w-full max-w-xs">
            <Select
              id="quiz-version-selector"
              value={String(currentVersion)}
              onChange={handleVersionChange}
              options={versionOptions}
              placeholder="Select version…"
              colorMode="never"
            />
          </div>

          {/* Actions row (view / edit / duplicate / delete) */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <IconButton
              icon="mingcute:edit-line"
              title="Edit"
              variant="borderless"
              size="md"
              onClick={handleEdit}
            />
            <IconButton
              icon="mingcute:copy-2-line"
              title="Duplicate"
              variant="borderless"
              size="md"
              onClick={handleDuplicate}
            />
            <IconButton
              icon="mingcute:delete-2-line"
              title="Delete"
              variant="borderless"
              size="md"
              className="text-[var(--color-error)]"
              onClick={openDeleteModal}
              loading={isDeleting}
            />
          </div>
        </div>
      </div>

      {/* Same delete warning modal as table */}
      <WarningModal
        open={confirmOpen}
        title="Delete this quiz?"
        message={
          <>
            This action cannot be undone. The quiz and its data will be removed.
            All attempts related to quiz will also be deleted and invalidated.
            <br />
            <span className="text-[var(--color-text-secondary)]">
              Proceed with deletion?
            </span>
          </>
        }
        cancelLabel="Cancel"
        continueLabel={isDeleting ? "Deleting..." : "Continue"}
        onCancel={cancelDelete}
        onContinue={isDeleting ? () => {} : confirmDelete}
      />
    </>
  );
}
