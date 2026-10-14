import { SEARCH_FIELD_OPERATORS, searchQuery, type SearchField } from '@embrace/shared';
import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS } from './filters';
import type { SearchNames } from './searchNames';
import {
  SEARCH_FIELDS,
  buildSearchQuery,
  describeQuery,
  describeQuerySegments,
  referencesDeleted,
  draftsFromQuery,
  filtersToQuery,
  NAME_ONLY_SAVE_NOTE,
  searchNarrowedToName,
  newDraft,
  operatorsFor,
  withField,
  type DraftCondition,
} from './searchQuery';

// Well-formed ids for tag and group conditions.
const TAG_A = 'clh3am8hi0000qwer1234abcd';
const TAG_B = 'clh3am8hi0001qwer1234abcd';
const GROUP_A = 'clh3am8hi0002qwer1234abcd';
const GONE = 'clh3am8hi0009qwer1234abcd';
const names: SearchNames = {
  tags: new Map([
    [TAG_A, 'Choir'],
    [TAG_B, 'Follow-up'],
  ]),
  groups: new Map([[GROUP_A, 'Youth']]),
};

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

  it('converts the tag, group and family conditions', () => {
    const result = buildSearchQuery(
      [
        draft('tags', { operator: 'includesAll', values: [TAG_A, TAG_B] }),
        draft('groups', { operator: 'excludesAll', values: [GROUP_A] }),
        draft('family', { operator: 'isNotEmpty' }),
      ],
      'AND',
    );
    expect(result.ok && result.query.conditions).toEqual([
      { field: 'tags', operator: 'includesAll', value: [TAG_A, TAG_B] },
      { field: 'groups', operator: 'excludesAll', value: [GROUP_A] },
      { field: 'family', operator: 'isNotEmpty' },
    ]);
  });

  it('asks for a choice when a tag or group condition has none', () => {
    const tags = draft('tags', { operator: 'includesAny' });
    const groups = draft('groups', { operator: 'includesAny' });
    expect(buildSearchQuery([tags, groups], 'AND')).toEqual({
      ok: false,
      errors: {
        [tags.key]: 'Choose at least one value',
        [groups.key]: 'Choose at least one value',
      },
    });
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
        { field: 'tags' as const, operator: 'excludesAll' as const, value: [TAG_A, GONE] },
        { field: 'groups' as const, operator: 'includesAny' as const, value: [GROUP_A] },
        { field: 'family' as const, operator: 'isEmpty' as const },
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
      engagement: 'all',
      joinedFrom: '2026-01-01',
      joinedTo: '',
      tag: TAG_A,
      group: GROUP_A,
    });
    expect(query).toEqual({
      conditions: [
        { field: 'name', operator: 'contains', value: 'ann' },
        { field: 'roles', operator: 'includes', value: 'leader' },
        { field: 'engagement.membershipStage', operator: 'equals', value: 'new_member' },
        { field: 'engagement.riskLevel', operator: 'equals', value: 'high' },
        { field: 'isActive', operator: 'equals', value: false },
        { field: 'createdAt', operator: 'between', value: ['2026-01-01', '9999-12-31'] },
        { field: 'tags', operator: 'includesAny', value: [TAG_A] },
        { field: 'groups', operator: 'includesAny', value: [GROUP_A] },
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

describe('engagement bands and the name-only text search', () => {
  it('turns each engagement band into score conditions', () => {
    const band = (engagement: string) =>
      filtersToQuery({ ...EMPTY_FILTERS, engagement })?.conditions;
    expect(band('high')).toEqual([
      { field: 'engagement.engagementScore', operator: 'gte', value: 80 },
    ]);
    expect(band('medium')).toEqual([
      { field: 'engagement.engagementScore', operator: 'gte', value: 50 },
      { field: 'engagement.engagementScore', operator: 'lt', value: 80 },
    ]);
    expect(band('low')).toEqual([
      { field: 'engagement.engagementScore', operator: 'lt', value: 50 },
    ]);
    expect(band('all')).toBeUndefined();
  });

  it('says when the text search is narrowed to names', () => {
    expect(searchNarrowedToName({ ...EMPTY_FILTERS, search: 'ann' })).toBe(false);
    expect(searchNarrowedToName({ ...EMPTY_FILTERS, engagement: 'high' })).toBe(false);
    expect(searchNarrowedToName({ ...EMPTY_FILTERS, search: 'ann', engagement: 'high' })).toBe(
      true,
    );
    expect(searchNarrowedToName({ ...EMPTY_FILTERS, search: 'ann', role: 'leader' })).toBe(true);
    expect(NAME_ONLY_SAVE_NOTE).toMatch(/^The text search is saved as a name match only/);
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

describe('tag and group names in descriptions', () => {
  const query = {
    conditions: [
      { field: 'tags' as const, operator: 'includesAny' as const, value: [TAG_A, GONE] },
      { field: 'groups' as const, operator: 'excludesAll' as const, value: [GROUP_A] },
      { field: 'family' as const, operator: 'isNotEmpty' as const },
    ],
    logic: 'AND' as const,
  };

  it('names tags and groups, and marks a deleted one', () => {
    expect(describeQuery(query, names)).toBe(
      'Tags include any of Choir, (deleted) AND Groups include none of Youth AND Family is not empty',
    );
    expect(describeQuerySegments(query, names).filter((s) => s.deleted)).toEqual([
      { text: '(deleted)', deleted: true },
    ]);
    expect(referencesDeleted(query, names)).toBe(true);
    expect(referencesDeleted({ ...query, conditions: query.conditions.slice(1) }, names)).toBe(
      false,
    );
  });

  it('marks nothing deleted before the names load', () => {
    expect(describeQuery(query)).toBe(
      'Tags include any of …, … AND Groups include none of … AND Family is not empty',
    );
    expect(referencesDeleted(query, { tags: null, groups: null })).toBe(false);
  });
});
