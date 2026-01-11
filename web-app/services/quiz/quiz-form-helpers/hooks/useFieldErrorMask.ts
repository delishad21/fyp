"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

/** Manage "touch to clear" for top-level field errors. */
export function useFieldErrorMask<TField extends string>(
  fieldErrors: Partial<Record<TField, string | string[] | undefined>>
) {
  const [clearedFields, setClearedFields] = useState<Set<TField>>(new Set());

  // Reset cleared state whenever new errors come in
  useEffect(() => setClearedFields(new Set()), [fieldErrors]);

  const clearFieldError = useCallback((field: TField) => {
    setClearedFields((prev) =>
      prev.has(field) ? prev : new Set(prev).add(field)
    );
  }, []);

  const getVisibleFieldError = useCallback(
    (field: TField) =>
      clearedFields.has(field) ? undefined : fieldErrors[field],
    [clearedFields, fieldErrors]
  );

  return { clearFieldError, getVisibleFieldError };
}

/** Manage per-index/per-question error masking. */
export function useIndexedErrorMask(
  externalErrors?: Array<string | string[] | undefined>
) {
  // Keep an internal copy of errors so we can reindex them on delete.
  const [errors, setErrors] = useState<Array<string | string[] | undefined>>(
    externalErrors ?? []
  );
  const [clearedIndexes, setClearedIndexes] = useState<Set<number>>(new Set());

  // Whenever upstream errors change (e.g. new validation run), reset.
  useEffect(() => {
    setErrors(externalErrors ?? []);
    setClearedIndexes(new Set());
  }, [externalErrors]);

  const clearErrorAtIndex = useCallback((index: number) => {
    setClearedIndexes((prev) =>
      prev.has(index) ? prev : new Set(prev).add(index)
    );
  }, []);

  /**
   * Call this when you delete a question at `index` so the errors stay aligned
   * with the remaining questions.
   */
  const removeErrorIndex = useCallback((index: number) => {
    setErrors((prev) => prev.filter((_, i) => i !== index));

    // Reindex cleared masks as well.
    setClearedIndexes((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
        // if i === index, drop it
      });
      return next;
    });
  }, []);

  const visibleErrors = useMemo(
    () =>
      (errors ?? []).map((err, i) => (clearedIndexes.has(i) ? undefined : err)),
    [errors, clearedIndexes]
  );

  const erroredIndexes = useMemo(
    () => visibleErrors.map((err, i) => (err ? i : -1)).filter((i) => i >= 0),
    [visibleErrors]
  );

  return { visibleErrors, clearErrorAtIndex, erroredIndexes, removeErrorIndex };
}
