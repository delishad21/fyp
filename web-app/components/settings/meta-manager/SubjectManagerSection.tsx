"use client";

import { useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import Button from "@/components/ui/buttons/Button";
import IconButton from "@/components/ui/buttons/IconButton";
import TextInput from "@/components/ui/text-inputs/TextInput";
import { ColorSelect } from "@/components/ui/selectors/color-select/ColorSelect";
import { useToast } from "@/components/ui/toast/ToastProvider";
import type { FilterMeta } from "@/services/quiz/types/quiz-table-types";
import {
  addFilterMeta,
  deleteFilterMeta,
  editFilterMeta,
} from "@/services/quiz/actions/quiz-metadata-actions";

type SubjectOption = { label: string; value: string; colorHex?: string };

export function SubjectManagerSection({
  subjects,
  refreshing,
  onRefresh,
  onMetaUpdated,
}: {
  subjects: SubjectOption[];
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onMetaUpdated: (meta: FilterMeta) => void;
}) {
  const { showToast } = useToast();
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#ef4444");
  const [adding, setAdding] = useState(false);

  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState("#ef4444");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingValue, setDeletingValue] = useState<string | null>(null);

  const disabled = adding || savingEdit || deletingValue !== null || refreshing;

  const editingSubject = useMemo(
    () => subjects.find((s) => s.value === editingValue),
    [subjects, editingValue]
  );

  async function onAdd() {
    const label = newLabel.trim();
    if (!label) {
      showToast({
        title: "Subject required",
        description: "Enter a subject name first.",
        variant: "error",
      });
      return;
    }

    try {
      setAdding(true);
      const res = await addFilterMeta("subject", label, { colorHex: newColor });
      if (!res.ok) {
        showToast({
          title: "Failed to add subject",
          description: res.message || "Please try again.",
          variant: "error",
        });
        return;
      }
      setNewLabel("");
      await onRefresh();
      showToast({
        title: "Subject added",
        description: `Added "${res.option.label}".`,
        variant: "success",
      });
    } catch (e: any) {
      showToast({
        title: "Failed to add subject",
        description: e?.message || "Please try again.",
        variant: "error",
      });
    } finally {
      setAdding(false);
    }
  }

  function startEdit(subject: SubjectOption) {
    setEditingValue(subject.value);
    setEditLabel(subject.label);
    setEditColor(subject.colorHex || "#ef4444");
  }

  function cancelEdit() {
    setEditingValue(null);
    setEditLabel("");
    setEditColor("#ef4444");
  }

  async function saveEdit() {
    const target = editingValue;
    const label = editLabel.trim();
    if (!target || !label) return;

    try {
      setSavingEdit(true);
      const res = await editFilterMeta("subject", target, {
        label,
        colorHex: editColor,
      });
      if (!res.ok || !res.meta) {
        showToast({
          title: "Failed to update subject",
          description: res.message || "Please try again.",
          variant: "error",
        });
        return;
      }

      onMetaUpdated(res.meta);
      cancelEdit();
      showToast({
        title: "Subject updated",
        description: `Updated to "${label}".`,
        variant: "success",
      });
    } catch (e: any) {
      showToast({
        title: "Failed to update subject",
        description: e?.message || "Please try again.",
        variant: "error",
      });
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeSubject(value: string, label: string) {
    const confirmed = window.confirm(`Delete subject "${label}"?`);
    if (!confirmed) return;

    try {
      setDeletingValue(value);
      const res = await deleteFilterMeta("subject", value);
      if (!res.ok || !res.meta) {
        const details =
          res.inUse && res.count
            ? `Used by ${res.count} quiz(es).`
            : res.message || "Please try again.";
        showToast({
          title: "Cannot delete subject",
          description: details,
          variant: "error",
        });
        return;
      }

      onMetaUpdated(res.meta);
      showToast({
        title: "Subject deleted",
        description: `Removed "${label}".`,
        variant: "success",
      });
    } catch (e: any) {
      showToast({
        title: "Cannot delete subject",
        description: e?.message || "Please try again.",
        variant: "error",
      });
    } finally {
      setDeletingValue(null);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/40 p-4">
      <div className="mb-4 flex items-center gap-2">
        <Icon icon="mingcute:book-2-line" className="h-5 w-5 text-[var(--color-icon)]" />
        <h2 className="text-base font-medium text-[var(--color-text-primary)]">
          Subjects
        </h2>
      </div>

      <div className="mb-4 grid gap-3 rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <TextInput
            id="new-subject-label"
            label="Add Subject"
            placeholder="e.g. Geography"
            value={newLabel}
            onChange={(e) => setNewLabel(e.currentTarget.value)}
          />
          <ColorSelect
            value={newColor}
            onChange={setNewColor}
            label="Subject Color"
            compact
            hideLabel
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={onAdd}
            loading={adding}
            disabled={disabled}
            className="h-11 min-w-[140px]"
          >
            Add Subject
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {subjects.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">No subjects yet.</p>
        ) : (
          subjects.map((subject) => {
            const isEditing = editingValue === subject.value;
            if (isEditing) {
              return (
                <div
                  key={subject.value}
                  className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-3"
                >
                  <div className="grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <TextInput
                        id={`edit-subject-${subject.value}`}
                        label="Subject Name"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.currentTarget.value)}
                      />
                      <ColorSelect
                        value={editColor}
                        onChange={setEditColor}
                        label="Subject Color"
                        compact
                        hideLabel
                      />
                    </div>
                    <div className="flex flex-wrap items-end justify-end gap-3">
                      <Button
                        type="button"
                        onClick={saveEdit}
                        loading={savingEdit}
                        disabled={disabled}
                      >
                        Save
                      </Button>
                      <Button type="button" variant="ghost" onClick={cancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={subject.value}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: subject.colorHex || "#ffffff" }}
                  />
                  <span className="truncate text-sm text-[var(--color-text-primary)]">
                    {subject.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <IconButton
                    icon="mingcute:edit-line"
                    title="Edit subject"
                    size="sm"
                    onClick={() => startEdit(subject)}
                    disabled={disabled}
                    className="border-[var(--color-bg2)] text-[var(--color-text-secondary)]"
                  />
                  <IconButton
                    icon="mingcute:delete-2-line"
                    title="Delete subject"
                    size="sm"
                    variant="error"
                    onClick={() => removeSubject(subject.value, subject.label)}
                    disabled={disabled}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {editingSubject && (
        <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
          Editing: {editingSubject.label}
        </p>
      )}
    </section>
  );
}
