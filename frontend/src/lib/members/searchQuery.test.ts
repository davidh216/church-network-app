import { SEARCH_FIELD_OPERATORS, searchQuery, type SearchField } from '@embrace/shared';
import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS } from './filters';
import {
  SEARCH_FIELDS,
  buildSearchQuery,
  describeQuery,
  draftsFromQuery,
  filtersToQuery,
  newDraft,
  operatorsFor,
  withField,
  type DraftCondition,
} from './searchQuery';

const draft = (field: SearchField, updates: Partial<DraftCondition>): DraftCondition => ({
  ...newDraft(field),
  ...updates,
});

describe('field metadata', () => {
  it('covers every field the API accepts, each with its operators', () => {
    expect(SEARCH_FIELDS.map((f) => f.field).sort()).toEqual(
      Object.keys(SEARCH_FIELD_OPERATORS).sort(),
    );
    expect(operatorsFor('engagement.engagementScore')).toContain('between');
    expect(operatorsFor('isActive')).toEqual(['equals']);
  });

  it('a new field starts on its first operator with empty values', () => {
    const changed = withField(draft('name', { value: 'ann' }), 'createdAt');
    expect(changed).toMatchObject({ field: 'createdAt', operator: 'before', value: '' });
  });
});

describe('buildSearchQuery', () => {
  it('builds the spec query: stage equals new_member AND engagement at least 50', () => {
    const result = buildSearchQuery(
      [
        draft('engagement.membershipStage', { operator: 'equals', value: 'new_member' }),
        draft('engagement.engagementScore', { operator: 'gte', value: '50' }),
      ],
      'AND',
    );
    expect(result).toEqual({
      ok: true,
      query: {
        conditions: [
          { field: 'engagement.membershipStage', operator: 'equals', value: 'new_member' },
          { field: 'engagement.engagementScore', operator: 'gte', value: 50 },
        ],
        logic: 'AND',
      },
    });
  });

  it('converts each value type: booleans, between ranges, in lists, isEmpty', () => {
    const result = buildSearchQuery(
      [
        draft('isActive', { value: 'false' }),
        draft('createdAt', { operator: 'between', value: '2026-01-01', value2: '2026-01-31' }),
        draft('engagement.riskLevel', { operator: 'in', values: ['high', 'medium'] }),
        draft('phone', { operator: 'isEmpty' }),
      ],
      'OR',
    );
    expect(result.ok && result.query.conditions).toEqual([
      { field: 'isActive', operator: 'equals', value: false },
      { field: 'createdAt', operator: 'between', value: ['2026-01-01', '2026-01-31'] },
      { field: 'engagement.riskLevel', operator: 'in', value: ['high', 'medium'] },
      { field: 'phone', operator: 'isEmpty' },
    ]);
  });

  it('reports a message per invalid condition', () => {
    const empty = draft('name', {});
    const range = draft('engagement.engagementScore', {
      operator: 'between',
      value: '80',
      value2: '20',
    });
    const half = draft('lastLoginAt', { operator: 'between', value: '2026-01-01' });
    const none = draft('engagement.membershipStage', { operator: 'in' });
    const nan = draft('engagement.engagementScore', { operator: 'gt', value: 'abc' });
    const result = buildSearchQuery([empty, range, half, none, nan], 'AND');
    expect(result).toEqual({
      ok: false,
      errors: {
        [empty.key]: 'Enter a value',
        [range.key]: 'The first value must not exceed the second',
        [half.key]: 'Enter both values',
        [none.key]: 'Choose at least one value',
        [nan.key]: 'Enter a number',
      },
    });
  });
});

describe('draftsFromQuery', () => {
  it('round-trips a query through the drafts', () => {
    const query = {
      conditions: [
        {
          field: 'engagement.engagementScore' as const,
          operator: 'between' as const,
          value: [10, 20] as [number, number],
        },
        {
          field: 'engagement.membershipStage' as const,
          operator: 'in' as const,
          value: ['leader' as const],
        },
        { field: 'isActive' as const, operator: 'equals' as const, value: true },
        { field: 'bio' as const, operator: 'isEmpty' as const },
      ],
      logic: 'OR' as const,
    };
    const result = buildSearchQuery(draftsFromQuery(query), 'OR');
    expect(result).toEqual({ ok: true, query });
  });
});

describe('filtersToQuery', () => {
  it('returns null without filters', () => {
    expect(filtersToQuery(EMPTY_FILTERS)).toBeNull();
  });

  it('turns a lone search into OR over the four text fields', () => {
    const query = filtersToQuery({ ...EMPTY_FILTERS, search: ' ann ' });
    expect(query).toEqual({
      conditions: ['name', 'email', 'phone', 'bio'].map((field) => ({
        field,
        operator: 'contains',
        value: 'ann',
      })),
      logic: 'OR',
    });
  });

  it('turns the quick filters into AND conditions with an inclusive joined range', () => {
    const query = filtersToQuery({
      search: 'ann',
      role: 'leader',
      stage: 'new_member',
      risk: 'high',
      status: 'inactive',
      joinedFrom: '2026-01-01',
      joinedTo: '',
    });
    expect(query).toEqual({
      conditions: [
        { field: 'name', operator: 'contains', value: 'ann' },
        { field: 'roles', operator: 'includes', value: 'leader' },
        { field: 'engagement.membershipStage', operator: 'equals', value: 'new_member' },
        { field: 'engagement.riskLevel', operator: 'equals', value: 'high' },
        { field: 'isActive', operator: 'equals', value: false },
        { field: 'createdAt', operator: 'between', value: ['2026-01-01', '9999-12-31'] },
      ],
      logic: 'AND',
    });
    expect(searchQuery.safeParse(query).success).toBe(true);
  });

  it('drops an inverted joined range (the list does not apply it either)', () => {
    expect(
      filtersToQuery({ ...EMPTY_FILTERS, joinedFrom: '2026-02-01', joinedTo: '2026-01-01' }),
    ).toBeNull();
    expect(
      filtersToQuery({
        ...EMPTY_FILTERS,
        risk: 'low',
        joinedFrom: '2026-02-01',
        joinedTo: '2026-01',
      }),
    ).toEqual({
      conditions: [{ field: 'engagement.riskLevel', operator: 'equals', value: 'low' }],
      logic: 'AND',
    });
  });
});

describe('describeQuery', () => {
  it('reads as one line with the logic between conditions', () => {
    expect(
      describeQuery({
        conditions: [
          { field: 'engagement.membershipStage', operator: 'equals', value: 'new_member' },
          { field: 'engagement.engagementScore', operator: 'between', value: [50, 90] },
          { field: 'isActive', operator: 'equals', value: true },
        ],
        logic: 'AND',
      }),
    ).toBe(
      'Membership stage equals New Member AND Engagement score between 50 and 90 AND Status equals Active',
    );
  });
});
