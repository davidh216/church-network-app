import { searchQuery } from '@embrace/shared';
import { describe, expect, it } from 'vitest';
import { predefinedSearches } from './predefinedSearches';

describe('predefinedSearches', () => {
  it('dates "New Members (Last 30 Days)" from the given time', () => {
    const now = Date.parse('2026-03-31T12:00:00Z');
    const recent = predefinedSearches(now).find((s) => s.name === 'New Members (Last 30 Days)');
    expect(recent?.query.conditions[0]).toEqual({
      field: 'createdAt',
      operator: 'after',
      value: '2026-03-01',
    });
  });

  it('names each search once', () => {
    const names = predefinedSearches().map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('only contains queries the API accepts', () => {
    for (const search of predefinedSearches()) {
      expect(searchQuery.safeParse(search.query).success, search.name).toBe(true);
    }
  });
});
