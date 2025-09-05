"use client";
import { FiltersValue } from "@/components/table/Filters";
import { useState, useMemo, useCallback } from "react";

export function useTableFilters(initial: Partial<FiltersValue> = {}) {
  const [draft, setDraft] = useState<FiltersValue>({
    name: initial.name ?? "",
    subjects: initial.subjects ?? [],
    topics: initial.topics ?? [],
    types: initial.types ?? [],
    createdStart: initial.createdStart,
    createdEnd: initial.createdEnd,
  });

  const set = useCallback((patch: Partial<FiltersValue>) => {
    setDraft((d) => ({
      ...d,
      ...patch,
      // respect presence checks for date fields (explicit undefined clears)
      createdStart: Object.prototype.hasOwnProperty.call(patch, "createdStart")
        ? patch.createdStart
        : d.createdStart,
      createdEnd: Object.prototype.hasOwnProperty.call(patch, "createdEnd")
        ? patch.createdEnd
        : d.createdEnd,
    }));
  }, []);

  const reset = useCallback(() => {
    setDraft({
      name: "",
      subjects: [],
      topics: [],
      types: [],
      createdStart: undefined,
      createdEnd: undefined,
    });
  }, []);

  // Helps keep child props stable
  const value = useMemo(() => draft, [draft]);

  return { value, set, reset };
}
