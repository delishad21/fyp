"use client";

/**
 * Filters Component
 *
 * Purpose:
 *   - Provides a set of filter controls for quiz/data tables.
 *   - Allows filtering by name, subject(s), topic(s), type(s), and created date range.
 *
 * Props:
 *   @param {FilterMeta} meta
 *     - Metadata defining available filter options (subjects, topics, types).
 *
 *   @param {FiltersValue} value
 *     - Current draft filter values (name, subjects, topics, types, date range).
 *
 *   @param {(patch: Partial<FiltersValue>) => void} onChange
 *     - Called whenever a filter field is updated; merges patch into draft state.
 *
 *   @param {() => void} onReset
 *     - Clears all filters to defaults.
 *
 *   @param {boolean} [isLoading]
 *     - Optional flag to indicate loading state (can be used to disable inputs).
 *
 * Behavior:
 *   - Renders a text search, multiple multi-selects (Subject, Topic, Type),
 *     a date range picker, and a reset button.
 *   - All changes update only the draft filter state; promotion to committed query
 *     happens higher up (e.g. DataTable).
 *   - Reset button clears all fields and reverts to default values.
 *
 * Integration:
 *   - Designed to work with `DataTable` and `useTableFilters`.
 *   - Can be extended with new filters by updating `FiltersValue` and `FilterMeta`.
 */

import TextSearch from "../ui/text-inputs/TextSearch";
import DateRangeField from "../ui/selectors/DateRangeField";
import MultiSelect from "../ui/selectors/multi-select/MultiSelect";
import type { FilterMeta } from "../../services/quiz/types/quiz-table-types";
import Button from "../ui/buttons/Button";

export type FiltersValue = {
  // DRAFT layer values
  name: string;
  subjects: string[];
  topics: string[];
  types: string[];
  createdStart?: string; // 'YYYY-MM-DD'
  createdEnd?: string; // 'YYYY-MM-DD'
};

export const FilterTriggerStyles =
  "items-center justify-between rounded-md " +
  "border border-[var(--color-bg3)] bg-[var(--color-bg2)] " +
  "px-3 text-sm leading-none text-[var(--color-text-primary)] hover:bg-[var(--color-bg2)] focus:ring-2 focus:ring-[var(--color-primary)]";

export default function Filters({
  meta,
  value,
  onChange,
  onReset,
  isLoading,
}: {
  meta: FilterMeta;
  value: FiltersValue; // <- DRAFT
  onChange: (patch: Partial<FiltersValue>) => void; // <- updates DRAFT only
  onReset: () => void;
  isLoading?: boolean;
}) {
  const subjectOptions = meta.subjects.map((s) => ({
    label: s.label,
    value: s.label,
    colorHex: s.colorHex,
  }));

  const topicOptions = meta.topics.map((t) => ({
    label: t.label,
    value: t.label,
  }));

  const typeOptions = meta.types.map((t) => ({
    label: t.label,
    value: t.value,
    colorHex: t.colorHex,
  }));
  return (
    <div className="flex items-end gap-3">
      <TextSearch
        label="Name"
        value={value.name}
        onChange={(name) => onChange({ name })}
        placeholder="Search name…"
      />

      <MultiSelect
        label="Subject"
        options={subjectOptions}
        value={value.subjects}
        onChange={(subjects) => onChange({ subjects })}
      />
      <MultiSelect
        label="Topic"
        options={topicOptions}
        value={value.topics}
        onChange={(topics) => onChange({ topics })}
      />
      <MultiSelect
        label="Type"
        options={typeOptions}
        value={value.types}
        onChange={(types) => onChange({ types })}
      />

      <DateRangeField
        label="Created"
        start={value.createdStart}
        end={value.createdEnd}
        onChange={({ start, end }) =>
          onChange({ createdStart: start, createdEnd: end })
        }
      />

      <Button
        type="button"
        onClick={onReset}
        className="min-w-30 rounded-md border border-[var(--color-bg3)] bg-[var(--color-bg2)]"
      >
        Reset All
      </Button>
    </div>
  );
}
