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
  errors?: Array<string | string[] | undefined>
) {
  const [clearedIndexes, setClearedIndexes] = useState<Set<number>>(new Set());

  // Reset cleared state whenever new errors come in
  useEffect(() => setClearedIndexes(new Set()), [errors]);

  const clearErrorAtIndex = useCallback((index: number) => {
    setClearedIndexes((prev) =>
      prev.has(index) ? prev : new Set(prev).add(index)
    );
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

  return { visibleErrors, clearErrorAtIndex, erroredIndexes };
}
