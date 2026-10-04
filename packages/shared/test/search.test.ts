import { describe, expect, it } from 'vitest';
import {
  listUsersQuery,
  SEARCH_FIELD_OPERATORS,
  searchCondition,
  searchQuery,
  type SearchField,
} from '../src';

// A valid value for every field/operator pair the search allows.
const VALID: Record<SearchField, Record<string, unknown>> = {
  name: { contains: 'ann', equals: 'Ann Lee', startsWith: 'An', isEmpty: undefined },
  email: { contains: '@x', equals: 'a@x.org', startsWith: 'a', isEmpty: undefined },
  phone: { contains: '555', equals: '555-0100', startsWith: '+1', isEmpty: undefined },
  bio: { contains: 'choir', equals: 'Hi', startsWith: 'I', isEmpty: undefined },
  roles: { includes: 'Member' },
  'engagement.engagementScore': { gt: 10, gte: 50, lt: 90, lte: 100, between: [20, 80] },
  'engagement.membershipStage': { equals: 'new_member', in: ['visitor', 'leader'] },
  'engagement.riskLevel': { equals: 'high', in: ['low', 'medium'] },
  createdAt: {
    before: '2026-01-31',
    after: '2026-01-01T00:00:00Z',
    between: ['2026-01-01', '2026-02-01'],
  },
  lastLoginAt: {
    before: '2026-10-01T12:00:00+02:00',
    after: '2026-09-01',
    between: ['2026-09-01', '2026-10-01'],
  },
  isActive: { equals: true },
};

const fields = Object.keys(SEARCH_FIELD_OPERATORS) as SearchField[];
const allOperators = [...new Set(Object.values(SEARCH_FIELD_OPERATORS).flat())];

describe('searchCondition', () => {
  it('lists a sample value for exactly the allowed pairs', () => {
    for (const field of fields) {
      expect(Object.keys(VALID[field]).sort()).toEqual([...SEARCH_FIELD_OPERATORS[field]].sort());
    }
  });

  for (const field of fields) {
    for (const operator of SEARCH_FIELD_OPERATORS[field]) {
      it(`accepts ${field} ${operator}`, () => {
        const value = VALID[field][operator];
        const condition = value === undefined ? { field, operator } : { field, operator, value };
        expect(searchCondition.safeParse(condition).success).toBe(true);
      });
    }
  }

  it('rejects every operator not allowed on a field', () => {
    for (const field of fields) {
      const allowed: readonly string[] = SEARCH_FIELD_OPERATORS[field];
      for (const operator of allOperators.filter((op) => !allowed.includes(op))) {
        const result = searchCondition.safeParse({ field, operator, value: 'x' });
        expect(result.success, `${field} ${operator}`).toBe(false);
      }
    }
  });

  it('rejects an unknown field', () => {
    expect(
      searchCondition.safeParse({ field: 'password', operator: 'equals', value: 'x' }).success,
    ).toBe(false);
  });

  it.each([
    { field: 'name', operator: 'contains', value: '' },
    { field: 'name', operator: 'contains', value: 3 },
    { field: 'engagement.engagementScore', operator: 'gt', value: '50' },
    { field: 'engagement.engagementScore', operator: 'between', value: [1] },
    { field: 'engagement.engagementScore', operator: 'between', value: [1, 2, 3] },
    { field: 'engagement.membershipStage', operator: 'equals', value: 'pastor' },
    { field: 'engagement.riskLevel', operator: 'in', value: [] },
    { field: 'createdAt', operator: 'before', value: 'last week' },
    { field: 'createdAt', operator: 'between', value: ['2026-01-01'] },
    { field: 'isActive', operator: 'equals', value: 'true' },
  ])('rejects a wrongly typed value: $field $operator $value', (condition) => {
    expect(searchCondition.safeParse(condition).success).toBe(false);
  });
});

describe('searchQuery', () => {
  const condition = {
    field: 'engagement.membershipStage',
    operator: 'equals',
    value: 'new_member',
  };

  it('accepts a query with sorting and paging', () => {
    const parsed = searchQuery.parse({
      conditions: [condition, { field: 'engagement.engagementScore', operator: 'gte', value: 50 }],
      logic: 'AND',
      sort: 'engagementScore',
      order: 'desc',
      page: 2,
      pageSize: 100,
    });
    expect(parsed.conditions).toHaveLength(2);
  });

  it.each([
    ['no conditions', { conditions: [], logic: 'AND' }],
    ['more than 10 conditions', { conditions: Array(11).fill(condition), logic: 'OR' }],
    ['a missing logic', { conditions: [condition] }],
    ['an unknown logic', { conditions: [condition], logic: 'XOR' }],
    ['an unknown sort', { conditions: [condition], logic: 'AND', sort: 'password' }],
    ['an unknown order', { conditions: [condition], logic: 'AND', order: 'up' }],
    ['page 0', { conditions: [condition], logic: 'AND', page: 0 }],
    ['pageSize over 100', { conditions: [condition], logic: 'AND', pageSize: 101 }],
  ])('rejects %s', (_label, query) => {
    expect(searchQuery.safeParse(query).success).toBe(false);
  });
});

describe('listUsersQuery', () => {
  it('defaults to the first page of 25', () => {
    expect(listUsersQuery.parse({})).toEqual({ page: 1, pageSize: 25 });
  });

  it('coerces query-string values', () => {
    expect(
      listUsersQuery.parse({
        q: '  ann ',
        role: 'leader',
        status: 'inactive',
        stage: 'new_member',
        risk: 'high',
        joinedFrom: '2026-01-01',
        joinedTo: '2026-01-31',
        sort: 'engagementScore',
        order: 'desc',
        page: '3',
        pageSize: '100',
      }),
    ).toEqual({
      q: 'ann',
      role: 'leader',
      status: 'inactive',
      stage: 'new_member',
      risk: 'high',
      joinedFrom: '2026-01-01',
      joinedTo: '2026-01-31',
      sort: 'engagementScore',
      order: 'desc',
      page: 3,
      pageSize: 100,
    });
  });

  it.each([
    { q: '' },
    { status: 'archived' },
    { stage: 'pastor' },
    { risk: 'none' },
    { joinedFrom: '2026-02-30T00:00:00Z' },
    { joinedTo: 'yesterday' },
    { sort: 'password' },
    { order: 'up' },
    { page: '0' },
    { page: '1.5' },
    { pageSize: '101' },
    { q: ['a', 'b'] },
  ])('rejects %o', (query) => {
    expect(listUsersQuery.safeParse(query).success).toBe(false);
  });
});
