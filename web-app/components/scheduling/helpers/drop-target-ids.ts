const CELL_PREFIX = "global-cell";
const BULK_PREFIX = "global-bulk-day";

export function makeCellDropId(classId: string, dayKey: string) {
  return `${CELL_PREFIX}::${encodeURIComponent(classId)}::${dayKey}`;
}

export function makeBulkDayDropId(dayKey: string) {
  return `${BULK_PREFIX}::${dayKey}`;
}

export function parseCellDropId(id: string) {
  const m = /^global-cell::(.+)::(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (!m) return null;
  return {
    classId: decodeURIComponent(m[1]),
    dayKey: m[2],
  };
}

export function parseBulkDayDropId(id: string) {
  const m = /^global-bulk-day::(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (!m) return null;
  return { dayKey: m[1] };
}

