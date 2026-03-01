"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import Button from "@/components/ui/buttons/Button";
import IconButton from "@/components/ui/buttons/IconButton";
import TextInput from "@/components/ui/text-inputs/TextInput";
import { useToast } from "@/components/ui/toast/ToastProvider";
import type { FilterMeta } from "@/services/quiz/types/quiz-table-types";
import {
  addFilterMeta,
  deleteFilterMeta,
  editFilterMeta,
} from "@/services/quiz/actions/quiz-metadata-actions";

type TopicOption = { label: string; value: string };

export function TopicManagerSection({
  topics,
  refreshing,
  onRefresh,
  onMetaUpdated,
}: {
  topics: TopicOption[];
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onMetaUpdated: (meta: FilterMeta) => void;
}) {
  const { showToast } = useToast();
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingValue, setDeletingValue] = useState<string | null>(null);

  const disabled = adding || savingEdit || deletingValue !== null || refreshing;

  async function onAdd() {
    const label = newLabel.trim();
    if (!label) {
      showToast({
        title: "Topic required",
        description: "Enter a topic name first.",
        variant: "error",
      });
      return;
    }

    try {
      setAdding(true);
      const res = await addFilterMeta("topic", label);
      if (!res.ok) {
        showToast({
          title: "Failed to add topic",
          description: res.message || "Please try again.",
          variant: "error",
        });
        return;
      }
      setNewLabel("");
      await onRefresh();
      showToast({
        title: "Topic added",
        description: `Added "${res.option.label}".`,
        variant: "success",
      });
    } catch (e: any) {
      showToast({
        title: "Failed to add topic",
        description: e?.message || "Please try again.",
        variant: "error",
      });
    } finally {
      setAdding(false);
    }
  }

  function startEdit(topic: TopicOption) {
    setEditingValue(topic.value);
    setEditLabel(topic.label);
  }

  function cancelEdit() {
    setEditingValue(null);
    setEditLabel("");
  }

  async function saveEdit() {
    const target = editingValue;
    const label = editLabel.trim();
    if (!target || !label) return;

    try {
      setSavingEdit(true);
      const res = await editFilterMeta("topic", target, { label });
      if (!res.ok || !res.meta) {
        showToast({
          title: "Failed to update topic",
          description: res.message || "Please try again.",
          variant: "error",
        });
        return;
      }
      onMetaUpdated(res.meta);
      cancelEdit();
      showToast({
        title: "Topic updated",
        description: `Updated to "${label}".`,
        variant: "success",
      });
    } catch (e: any) {
      showToast({
        title: "Failed to update topic",
        description: e?.message || "Please try again.",
        variant: "error",
      });
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeTopic(value: string, label: string) {
    const confirmed = window.confirm(`Delete topic "${label}"?`);
    if (!confirmed) return;

    try {
      setDeletingValue(value);
      const res = await deleteFilterMeta("topic", value);
      if (!res.ok || !res.meta) {
        const details =
          res.inUse && res.count
            ? `Used by ${res.count} quiz(es).`
            : res.message || "Please try again.";
        showToast({
          title: "Cannot delete topic",
          description: details,
          variant: "error",
        });
        return;
      }
      onMetaUpdated(res.meta);
      showToast({
        title: "Topic deleted",
        description: `Removed "${label}".`,
        variant: "success",
      });
    } catch (e: any) {
      showToast({
        title: "Cannot delete topic",
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
        <Icon icon="mingcute:tag-2-line" className="h-5 w-5 text-[var(--color-icon)]" />
        <h2 className="text-base font-medium text-[var(--color-text-primary)]">
          Topics
        </h2>
      </div>

      <div className="mb-4 grid gap-3 rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-3">
        <TextInput
          id="new-topic-label"
          label="Add Topic"
          placeholder="e.g. Fractions"
          value={newLabel}
          onChange={(e) => setNewLabel(e.currentTarget.value)}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={onAdd}
            loading={adding}
            disabled={disabled}
            className="h-11 min-w-[140px]"
          >
            Add Topic
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {topics.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">No topics yet.</p>
        ) : (
          topics.map((topic) => {
            const isEditing = editingValue === topic.value;
            if (isEditing) {
              return (
                <div
                  key={topic.value}
                  className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-3"
                >
                  <div className="grid gap-3">
                    <TextInput
                      id={`edit-topic-${topic.value}`}
                      label="Topic Name"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.currentTarget.value)}
                    />
                    <div className="flex items-center gap-2">
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
                key={topic.value}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-3"
              >
                <span className="truncate text-sm text-[var(--color-text-primary)]">
                  {topic.label}
                </span>
                <div className="flex items-center gap-2">
                  <IconButton
                    icon="mingcute:edit-line"
                    title="Edit topic"
                    size="sm"
                    onClick={() => startEdit(topic)}
                    disabled={disabled}
                    className="border-[var(--color-bg2)] text-[var(--color-text-secondary)]"
                  />
                  <IconButton
                    icon="mingcute:delete-2-line"
                    title="Delete topic"
                    size="sm"
                    variant="error"
                    onClick={() => removeTopic(topic.value, topic.label)}
                    disabled={disabled}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
