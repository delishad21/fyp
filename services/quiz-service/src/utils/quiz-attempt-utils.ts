import { getFamilyMetaMap } from "../model/quiz-base-model";

/** Resolve one family's live metadata (latest version under root). */
export async function getLiveMetaForRoot(rootId?: any) {
  if (!rootId) return null;
  const map = await getFamilyMetaMap([String(rootId)]);
  return map.get(String(rootId)) || null;
}

/** Resolve many families' live metadata in one shot. */
export async function getLiveMetaMapFromRows(
  rows: Array<{ quizRootId?: any }>
) {
  const rootIds = Array.from(
    new Set(
      rows
        .map((r) => (r.quizRootId ? String(r.quizRootId) : ""))
        .filter(Boolean)
    )
  );
  if (rootIds.length === 0) return new Map<string, any>();
  return getFamilyMetaMap(rootIds);
}
