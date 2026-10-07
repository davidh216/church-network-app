/**
 * Date formatting in the viewer's own locale (the browser's default, never a hard-coded one).
 * Missing or unparsable values give null, so callers can show nothing instead of "Invalid Date".
 */

/** The parsed date, or null when the value is missing or not a real date. */
export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The date in the browser's locale, e.g. "1/5/2024" or "05/01/2024"; null without a real date. */
export function formatLocalDate(
  value?: string | null,
  options?: Intl.DateTimeFormatOptions,
): string | null {
  return parseDate(value)?.toLocaleDateString(undefined, options) ?? null;
}

/**
 * True when the value is a calendar date sent as UTC midnight ('2026-10-04' or
 * '2026-10-04T00:00:00.000Z'), the way the API sends `date` columns and all-day dates.
 */
export function isUtcMidnight(value?: string | null): boolean {
  const date = parseDate(value);
  return date !== null && date.getTime() % 86_400_000 === 0;
}

/**
 * A calendar date in the browser's locale, read as its UTC day so a viewer west of UTC does not
 * see the day before; null without a real date.
 */
export function formatCalendarDate(
  value?: string | null,
  options?: Intl.DateTimeFormatOptions,
): string | null {
  return formatLocalDate(value, { ...options, timeZone: 'UTC' });
}

/** The date and time in the browser's locale; null without a real date. */
export function formatLocalDateTime(
  value?: string | null,
  options?: Intl.DateTimeFormatOptions,
): string | null {
  return parseDate(value)?.toLocaleString(undefined, options) ?? null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** The viewer's local calendar day as `YYYY-MM-DD` (the format of service dates). */
export function localIsoDay(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** The first and last day of the viewer's current month, as `YYYY-MM-DD` (both inclusive). */
export function monthRange(now: Date = new Date()): { from: string; to: string } {
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: localIsoDay(first), to: localIsoDay(last) };
}
