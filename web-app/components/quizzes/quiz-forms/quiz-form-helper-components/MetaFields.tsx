"use client";

/**
 * MetaFields Component
 *
 * Purpose:
 *   - Collects metadata for a quiz (name, subject, topic).
 *   - Renders a text input and two select dropdowns.
 *   - Handles validation errors and allows adding new options dynamically.
 *
 * Props:
 *   @param {FilterMeta} meta
 *     - Contains available subjects and topics.
 *   @param {{ name?: string; subject?: string; topic?: string }} defaults
 *     - Default values for fields.
 *   @param {(key: "name"|"subject"|"topic") => string|string[]|undefined} errorFor
 *     - Returns validation error(s) for a given field.
 *   @param {(key: "name"|"subject"|"topic") => void} clearError
 *     - Clears error(s) for a given field when user modifies it.
 *   @param {HandleAdd} [onAddSubject]
 *     - Optional handler to create new subjects.
 *   @param {HandleAdd} [onAddTopic]
 *     - Optional handler to create new topics.
 *
 * Behavior:
 *   - Renders a responsive grid (1 col on small screens, 3 cols on larger).
 *   - Clears field errors on user input/change.
 *   - Uses `colorHex` for subject options when available.
 *
 * UI:
 *   - TextInput for quiz name.
 *   - Select for subject (with color support + add new option).
 *   - Select for topic (add new option if handler provided).
 */

import Select from "@/components/ui/selectors/select/Select";
import TextInput from "@/components/ui/text-inputs/TextInput";
import type { FilterMeta } from "@/services/quiz/types/quiz-table-types";

type TopField = "name" | "subject" | "topic";

type CanonicalOption = { value: string; label: string; colorHex?: string };
type HandleAdd =
  | ((
      label: string,
      meta?: { colorHex?: string }
    ) =>
      | void
      | string
      | CanonicalOption
      | Promise<void | string | CanonicalOption>)
  | undefined;

export default function MetaFields({
  meta,
  defaults,
  errorFor,
  clearError,
  onAddSubject,
  onAddTopic,
}: {
  meta: FilterMeta;
  defaults: { name?: string; subject?: string; topic?: string };
  errorFor: (key: TopField) => string | string[] | undefined;
  clearError: (key: TopField) => void;
  onAddSubject?: HandleAdd;
  onAddTopic?: HandleAdd;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 items-start">
      <TextInput
        id="name"
        name="name"
        label="Name"
        placeholder="Quiz Name"
        required
        defaultValue={defaults.name ?? ""}
        error={errorFor("name")}
        onChange={() => clearError("name")}
      />

      <Select
        id="subject"
        name="subject"
        label="Subject"
        placeholder="Select A Subject"
        options={meta.subjects.map((s) => ({
          label: s.label,
          value: s.value,
          colorHex: s.colorHex,
        }))}
        required
        handleAdd={onAddSubject}
        defaultValue={defaults.subject ?? ""}
        error={errorFor("subject")}
        onChange={() => clearError("subject")}
        colorMode="always"
        searchable
      />

      <Select
        id="topic"
        name="topic"
        label="Topic"
        placeholder="Select A Topic"
        options={meta.topics.map((t) => ({ label: t.label, value: t.value }))}
        required
        handleAdd={onAddTopic}
        defaultValue={defaults.topic ?? ""}
        error={errorFor("topic")}
        onChange={() => clearError("topic")}
        searchable
      />
    </div>
  );
}
