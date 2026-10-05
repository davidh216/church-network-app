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

/** The date and time in the browser's locale; null without a real date. */
export function formatLocalDateTime(
  value?: string | null,
  options?: Intl.DateTimeFormatOptions,
): string | null {
  return parseDate(value)?.toLocaleString(undefined, options) ?? null;
}
