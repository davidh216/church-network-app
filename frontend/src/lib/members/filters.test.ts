import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  buildListParams,
  dateRangeError,
  hasActiveFilters,
  isIsoDate,
  nextSort,
  selectionLabel,
  toggleAllOnPage,
} from './filters';

const all = {
  search: '  ann ',
  role: 'leader',
  stage: 'new_member',
  risk: 'high',
  status: 'inactive',
  joinedFrom: '2026-01-01',
  joinedTo: '2026-01-31',
};

describe('buildListParams', () => {
  it('sends nothing but paging for empty filters', () => {
    expect(buildListParams(EMPTY_FILTERS, null, 1, 25, true)).toEqual({
      q: undefined,
      role: undefined,
      status: undefined,
      stage: undefined,
      risk: undefined,
      joinedFrom: undefined,
      joinedTo: undefined,
      page: 1,
      pageSize: 25,
    });
  });

  it('maps every staff filter, the sort and the page, trimming the search', () => {
    expect(buildListParams(all, { key: 'createdAt', order: 'desc' }, 3, 50, true)).toEqual({
      q: 'ann',
      role: 'leader',
      status: 'inactive',
      stage: 'new_member',
      risk: 'high',
      joinedFrom: '2026-01-01',
      joinedTo: '2026-01-31',
      sort: 'createdAt',
      order: 'desc',
      page: 3,
      pageSize: 50,
    });
  });

  it('gives members only the name search, a name sort and paging', () => {
    expect(buildListParams(all, { key: 'name', order: 'desc' }, 2, 25, false)).toEqual({
      q: 'ann',
      sort: 'name',
      order: 'desc',
      page: 2,
      pageSize: 25,
    });
    expect(buildListParams(all, { key: 'createdAt', order: 'asc' }, 1, 25, false)).toEqual({
      q: 'ann',
      page: 1,
      pageSize: 25,
    });
  });

  it('leaves out a date range that cannot be applied', () => {
    const params = buildListParams(
      { ...all, joinedFrom: '2026-02-01', joinedTo: '2026-01-01' },
      null,
      1,
      25,
      true,
    );
    expect(params.joinedFrom).toBeUndefined();
    expect(params.joinedTo).toBeUndefined();
  });

  it('accepts the far-future bound', () => {
    expect(
      buildListParams({ ...EMPTY_FILTERS, joinedTo: '9999-12-31' }, null, 1, 25, true),
    ).toMatchObject({ joinedTo: '9999-12-31' });
  });
});

describe('date helpers', () => {
  it('isIsoDate accepts real calendar dates only', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-2-3')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });

  it('dateRangeError allows open and equal ranges and rejects inverted or malformed ones', () => {
    expect(dateRangeError('', '')).toBeNull();
    expect(dateRangeError('2026-01-01', '')).toBeNull();
    expect(dateRangeError('2026-01-01', '2026-01-01')).toBeNull();
    expect(dateRangeError('2026-01-02', '2026-01-01')).toMatch(/after/);
    expect(dateRangeError('01/02/2026', '')).toMatch(/YYYY-MM-DD/);
  });
});

describe('hasActiveFilters', () => {
  it('is false for the empty filters and a blank search, true for any set filter', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, search: '   ' })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, risk: 'low' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, joinedTo: '2026-01-01' })).toBe(true);
  });
});

describe('nextSort', () => {
  it('cycles ascending, descending, unsorted; a new column starts ascending', () => {
    const asc = nextSort(null, 'name');
    expect(asc).toEqual({ key: 'name', order: 'asc' });
    const desc = nextSort(asc, 'name');
    expect(desc).toEqual({ key: 'name', order: 'desc' });
    expect(nextSort(desc, 'name')).toBeNull();
    expect(nextSort(desc, 'email')).toEqual({ key: 'email', order: 'asc' });
  });
});

describe('selection across pages', () => {
  it('toggleAllOnPage selects the page, keeps other pages, and clears the page when full', () => {
    const selected = toggleAllOnPage(new Set(['x']), ['a', 'b']);
    expect([...selected].sort()).toEqual(['a', 'b', 'x']);
    expect([...toggleAllOnPage(selected, ['a', 'b'])]).toEqual(['x']);
    expect(toggleAllOnPage(new Set(), []).size).toBe(0);
  });

  it('selectionLabel says "across pages" only when selected rows are off this page', () => {
    expect(selectionLabel(new Set(['a']), ['a', 'b'])).toBe('1 selected');
    expect(selectionLabel(new Set(['a', 'z']), ['a', 'b'])).toBe('2 selected across pages');
  });
});
