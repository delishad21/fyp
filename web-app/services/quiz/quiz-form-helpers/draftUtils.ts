import { BaseFormItemDraft, BaseFormItem } from "../types/quizTypes";

export const makeMcDraft = (
  initialNumOptions: number = 1
): BaseFormItemDraft => ({
  id: crypto.randomUUID(),
  type: "mc",
  text: "",
  timeLimit: 15,
  image: null,
  options: Array.from({ length: initialNumOptions }, () => ({
    id: crypto.randomUUID(),
    text: "",
    correct: false,
  })),
});

export const makeOpenDraft = (): BaseFormItemDraft => ({
  id: crypto.randomUUID(),
  type: "open",
  text: "",
  timeLimit: 15,
  image: null,
  answers: [{ id: crypto.randomUUID(), text: "", caseSensitive: false }],
});

/** Convert draft -> strict payload union (BasicItem) */
export function draftToPayload(d: BaseFormItemDraft): BaseFormItem {
  switch (d.type) {
    case "mc":
      return {
        id: d.id,
        type: "mc",
        text: d.text,
        timeLimit: d.timeLimit,
        image: d.image ?? null, // send image meta/url
        options: d.options ?? [],
      };
    case "open":
      return {
        id: d.id,
        type: "open",
        text: d.text,
        timeLimit: d.timeLimit,
        image: d.image ?? null, // send image meta/url
        answers: d.answers ?? [],
      };
    case "context":
      return {
        id: d.id,
        type: "context",
        text: d.text,
        image: d.image ?? null, // allow context image too
      };
  }
}

/** Labels for selector: number non-context items, show "CTX" for contexts */
export function makeSelectorLabels(items: BaseFormItemDraft[]): string[] {
  let qn = 0;
  return items.map((it) => (it.type === "context" ? "CTX" : String(++qn)));
}
