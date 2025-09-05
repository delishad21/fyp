// useBasicItems.ts
"use client";

import * as React from "react";
import { makeMcDraft, draftToPayload, makeSelectorLabels } from "./draftUtils";
import { BaseFormItemDraft, BaseQuizFormItemsConfig } from "../types/quizTypes";

/** Optional constraints & utilities you can turn on per form */

export function useBaseQuizFormItems(
  initial?: BaseFormItemDraft[],
  cfg?: BaseQuizFormItemsConfig
) {
  const config = React.useMemo<Required<BaseQuizFormItemsConfig>>(
    () => ({
      maxQuestions: cfg?.maxQuestions ?? Infinity,
      mcMinOptions: cfg?.mcMinOptions ?? 2,
      mcMaxOptions: cfg?.mcMaxOptions ?? Infinity,
      mcRequireSingleCorrect: cfg?.mcRequireSingleCorrect ?? false,
      initialNumMCOptions: cfg?.initialNumMCOptions ?? 2,
    }),
    [
      cfg?.maxQuestions,
      cfg?.mcMaxOptions,
      cfg?.mcMinOptions,
      cfg?.mcRequireSingleCorrect,
      cfg?.initialNumMCOptions,
    ]
  );

  // seed once: if initial provided & non-empty use it, else one default MC draft
  const [items, setItems] = React.useState<BaseFormItemDraft[]>(() =>
    initial && initial.length > 0
      ? initial
      : [makeMcDraft(config.initialNumMCOptions)]
  );
  const [currentIndex, setCurrentIndex] = React.useState(0);

  const current = items[currentIndex];

  const clampQuestions = React.useCallback(
    (next: BaseFormItemDraft[]) =>
      next.slice(
        0,
        Number.isFinite(config.maxQuestions)
          ? (config.maxQuestions as number)
          : next.length
      ),
    [config.maxQuestions]
  );

  const addQuestion = () => {
    setItems((prev) => {
      if (prev.length >= (config.maxQuestions as number)) return prev;
      const next = clampQuestions([
        ...prev,
        makeMcDraft(cfg?.initialNumMCOptions),
      ]);
      setCurrentIndex(next.length - 1);
      return next;
    });
  };

  const deleteQuestion = (idx: number) => {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      const newCount = next.length;

      setCurrentIndex((prevIdx) => {
        if (newCount <= 0) return 0;
        if (idx < prevIdx) return prevIdx - 1;
        if (idx === prevIdx) return Math.min(prevIdx, newCount - 1);
        return prevIdx;
      });

      return next;
    });
  };

  const selectQuestion = (index: number) => setCurrentIndex(index);

  const patchCurrent = (patch: Partial<BaseFormItemDraft>) =>
    setItems((prev) =>
      prev.map((q, i) => (i === currentIndex ? { ...q, ...patch } : q))
    );

  // shared
  const setText = (text: string) => patchCurrent({ text });
  const setTime = (timeLimit: number | null) => patchCurrent({ timeLimit });

  /**
   * NEW: set image meta (after uploading via /quiz/upload).
   * Pass `null` to clear the image.
   */
  const setImageMeta = (meta: BaseFormItemDraft["image"] | null) =>
    patchCurrent({ image: meta ?? null });

  // type switches
  const switchToOpen = () =>
    patchCurrent({
      type: "open",
      answers:
        current?.answers && current.answers.length > 0
          ? current.answers
          : [{ id: crypto.randomUUID(), text: "", caseSensitive: false }],
      options: undefined,
      // keep text, image, timeLimit
    });

  const switchToMc = () =>
    patchCurrent({
      type: "mc",
      options:
        current?.options && current.options.length > 0
          ? current.options
          : [
              { id: crypto.randomUUID(), text: "", correct: false },
              { id: crypto.randomUUID(), text: "", correct: false },
            ],
      answers: undefined,
      // keep text, image, timeLimit
    });

  const switchToContext = () =>
    patchCurrent({
      type: "context",
      answers: undefined,
      options: undefined,
      timeLimit: undefined, // no timer for context
      // keep text, image
    });

  // MC ops
  const addMCOption = () =>
    patchCurrent({
      options: [
        ...(current?.options ?? []),
        { id: crypto.randomUUID(), text: "", correct: false },
      ],
    });

  const removeMCOption = (id: string) =>
    patchCurrent({
      options: (current?.options ?? []).filter((x) => x.id !== id),
    });

  const setMCOptionText = (id: string, text: string) =>
    patchCurrent({
      options: (current?.options ?? []).map((x) =>
        x.id === id ? { ...x, text } : x
      ),
    });

  const toggleCorrect = (id: string) =>
    patchCurrent({
      options: (current?.options ?? []).map((x) =>
        x.id === id ? { ...x, correct: !x.correct } : x
      ),
    });

  // Open-answer ops
  const addOpenAnswer = () =>
    patchCurrent({
      answers: [
        ...(current?.answers ?? []),
        { id: crypto.randomUUID(), text: "", caseSensitive: false },
      ],
    });

  const removeOpenAnswer = (id: string) =>
    patchCurrent({
      answers: (current?.answers ?? []).filter((x) => x.id !== id),
    });

  const setOpenAnswerText = (id: string, text: string) =>
    patchCurrent({
      answers: (current?.answers ?? []).map((x) =>
        x.id === id ? { ...x, text } : x
      ),
    });

  const toggleAnswerCaseSensitive = (id: string) =>
    patchCurrent({
      answers: (current?.answers ?? []).map((x) =>
        x.id === id ? { ...x, caseSensitive: !x.caseSensitive } : x
      ),
    });

  /** Enforce MC constraints (optional, useful for Rapid; harmless for Basic) */
  const ensureMcConstraints = React.useCallback(() => {
    const cur = items[currentIndex];
    if (!cur || cur.type !== "mc") return;

    let opts = cur.options ?? [];

    // min
    while (
      Number.isFinite(config.mcMinOptions) &&
      opts.length < (config.mcMinOptions as number)
    ) {
      opts = [...opts, { id: crypto.randomUUID(), text: "", correct: false }];
    }
    // max
    if (
      Number.isFinite(config.mcMaxOptions) &&
      opts.length > (config.mcMaxOptions as number)
    ) {
      opts = opts.slice(0, config.mcMaxOptions as number);
    }
    // single-correct
    if (config.mcRequireSingleCorrect && opts.length > 0) {
      const firstCorrect = opts.findIndex((o) => o.correct);
      if (firstCorrect < 0) {
        opts = opts.map((o, i) => ({ ...o, correct: i === 0 }));
      } else {
        opts = opts.map((o, i) => ({ ...o, correct: i === firstCorrect }));
      }
    }

    if (opts !== cur.options) patchCurrent({ options: opts });
  }, [
    items,
    currentIndex,
    config.mcMinOptions,
    config.mcMaxOptions,
    config.mcRequireSingleCorrect,
  ]);

  // selector labels and payload
  const selectorLabels = React.useMemo(
    () => makeSelectorLabels(items),
    [items]
  );

  // keep for backward compatibility
  const itemsJson = React.useMemo(
    () => JSON.stringify(items.map(draftToPayload)),
    [items]
  );

  // optional explicit serializer if you want to phase out itemsJson
  const serialize = React.useCallback(
    () => JSON.stringify(items.map(draftToPayload)),
    [items]
  );

  // optional external reset (useful in edit flows)
  const replaceItems = React.useCallback(
    (next: BaseFormItemDraft[]) => {
      setItems(
        clampQuestions(
          next && next.length ? next : [makeMcDraft(config.initialNumMCOptions)]
        )
      );
      setCurrentIndex(0);
    },
    [clampQuestions]
  );

  return {
    items,
    currentIndex,
    current,
    selectorLabels,
    itemsJson,
    serialize,
    replaceItems,

    addQuestion,
    deleteQuestion,
    selectQuestion,

    setText,
    setTime,
    setImageMeta, // <— export this one

    switchToOpen,
    switchToMc,
    switchToContext,

    addMCOption,
    removeMCOption,
    setMCOptionText,
    toggleCorrect,

    addOpenAnswer,
    removeOpenAnswer,
    setOpenAnswerText,
    toggleAnswerCaseSensitive,

    // constraints utility — call from forms that need it (e.g., Rapid)
    ensureMcConstraints,
  };
}
