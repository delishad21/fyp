export function toPct(score?: number, max?: number) {
  const s = Number(score || 0);
  const m = Number(max || 0);
  if (m <= 0) return 0;
  return s / m;
}

export function getDefaultTimezone() {
  return process.env.GAME_DEFAULT_CLASS_TIMEZONE || "Asia/Singapore";
}

export function getDefaultScheduleContribution() {
  const raw = Number(process.env.GAME_DEFAULT_SCHEDULE_CONTRIBUTION ?? 100);
  if (!Number.isFinite(raw)) return 100;
  return Math.max(0, raw);
}
