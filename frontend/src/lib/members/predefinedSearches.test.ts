import { describe, expect, it } from 'vitest';
import { predefinedSearches } from './predefinedSearches';

describe('predefinedSearches', () => {
  it('dates "New Members (Last 30 Days)" from the given time', () => {
    const now = Date.parse('2026-03-31T12:00:00Z');
    const recent = predefinedSearches(now).find((s) => s.name === 'New Members (Last 30 Days)');
    const conditions = (recent?.query as { conditions: Array<{ value: string }> }).conditions;
    expect(conditions[0]?.value).toBe('2026-03-01');
  });

  it('names each search once', () => {
    const names = predefinedSearches().map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
