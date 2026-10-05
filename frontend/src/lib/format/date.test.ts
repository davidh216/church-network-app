import { describe, expect, it } from 'vitest';
import {
  formatCalendarDate,
  formatLocalDate,
  formatLocalDateTime,
  isUtcMidnight,
  parseDate,
} from './date';

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

describe('calendar dates', () => {
  it('recognises UTC midnight values', () => {
    expect(isUtcMidnight('2026-10-04')).toBe(true);
    expect(isUtcMidnight('2026-10-04T00:00:00.000Z')).toBe(true);
    expect(isUtcMidnight('2026-10-04T00:00:01.000Z')).toBe(false);
    expect(isUtcMidnight('2026-10-04T05:00:00.000Z')).toBe(false);
    expect(isUtcMidnight(null)).toBe(false);
    expect(isUtcMidnight('garbage')).toBe(false);
  });

  it('formats the UTC day whatever the time zone', () => {
    const originalTz = process.env.TZ;
    try {
      for (const tz of ['America/Chicago', 'Pacific/Kiritimati', 'UTC']) {
        process.env.TZ = tz;
        expect(formatCalendarDate('2026-10-04T00:00:00.000Z', { day: 'numeric' })).toBe('4');
        expect(formatCalendarDate('2026-10-04', { day: 'numeric' })).toBe('4');
      }
      process.env.TZ = 'America/Chicago';
      expect(formatLocalDate('2026-10-04T00:00:00.000Z', { day: 'numeric' })).toBe('3');
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
    expect(formatCalendarDate(undefined)).toBeNull();
  });
});
