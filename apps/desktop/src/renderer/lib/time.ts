export type TimeValue = Date | number | string;

export function formatDateTime(
  value: TimeValue,
  locale?: string | string[],
): string {
  const date = toDate(value);
  if (!date) return "Unknown time";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatRelativeTime(
  value: TimeValue,
  now: TimeValue = Date.now(),
): string {
  const date = toDate(value);
  const reference = toDate(now);
  if (!date || !reference) return "Unknown time";

  const seconds = Math.max(
    0,
    Math.floor((reference.getTime() - date.getTime()) / 1_000),
  );
  if (seconds < 60) return "just now";
  if (seconds < 3_600) return `${String(Math.floor(seconds / 60))}m ago`;
  if (seconds < 86_400) return `${String(Math.floor(seconds / 3_600))}h ago`;
  return `${String(Math.floor(seconds / 86_400))}d ago`;
}

export function isOlderThan(
  value: TimeValue,
  durationMs: number,
  now: TimeValue = Date.now(),
): boolean {
  const date = toDate(value);
  const reference = toDate(now);
  if (!date || !reference) return true;

  return reference.getTime() - date.getTime() > durationMs;
}

function toDate(value: TimeValue): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
