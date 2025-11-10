export function formatAvailableUntil(
  iso: string,
  locale: string | undefined = undefined
) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();

  const sameDay =
    d.toDateString() === now.toDateString()
      ? "Today"
      : new Date(d.getTime() - 86400000).toDateString() === now.toDateString()
      ? "Tomorrow"
      : null;

  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  }).format(d);

  if (sameDay) return `Available until ${sameDay} ${time}`;

  const date = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: tz,
  }).format(d);
  return `Available until ${date} ${time}`;
}
