"use client";

import { addFilterMeta } from "../actions/quiz-metadata-actions";

export function useMetaAdders() {
  const addSubject = async (label: string, meta?: { colorHex?: string }) => {
    const res = await addFilterMeta("subject", label, {
      colorHex: meta?.colorHex,
    });
    if (!res.ok) return res.message || "Failed to add subject.";
    return res.option;
  };
  const addTopic = async (label: string) => {
    const res = await addFilterMeta("topic", label);
    if (!res.ok) return res.message || "Failed to add topic.";
    return res.option;
  };
  return { addSubject, addTopic };
}
