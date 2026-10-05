import { describe, expect, it } from 'vitest';
import { formatLocalDate, formatLocalDateTime, parseDate } from './date';

describe('date formatting', () => {
  it('parses real dates and rejects missing or invalid ones', () => {
    expect(parseDate('2024-01-05T00:00:00Z')?.toISOString()).toBe('2024-01-05T00:00:00.000Z');
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate('not a date')).toBeNull();
  });

  it("formats in the browser's default locale, not a hard-coded one", () => {
    const value = '2024-01-05T12:00:00Z';
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    expect(formatLocalDate(value, options)).toBe(
      new Date(value).toLocaleDateString(undefined, options),
    );
    expect(formatLocalDate(value)).toBe(new Date(value).toLocaleDateString());
    expect(formatLocalDateTime(value)).toBe(new Date(value).toLocaleString());
  });

  it('gives null instead of "Invalid Date"', () => {
    expect(formatLocalDate('garbage')).toBeNull();
    expect(formatLocalDateTime(undefined)).toBeNull();
  });
});
