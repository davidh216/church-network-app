import {
  SEARCH_FIELD_OPERATORS,
  searchCondition,
  searchQuery,
  type SearchCondition,
  type SearchField,
  type SearchOperator,
  type SearchQuery,
} from '@embrace/shared';
import { dateRangeError, type MemberFilters } from './filters';

/**
 * The advanced member search (POST /api/users/search) as the builder edits it. A draft keeps
 * every value as the inputs hold it (strings); `buildSearchQuery` turns the drafts into a
 * `searchQuery` with the shared schema, so the rules match what the API enforces.
 */

export type FieldKind = 'text' | 'role' | 'score' | 'stage' | 'risk' | 'date' | 'active';

export const SEARCH_FIELDS: { field: SearchField; label: string; kind: FieldKind }[] = [
  { field: 'name', label: 'Name', kind: 'text' },
  { field: 'email', label: 'Email', kind: 'text' },
  { field: 'phone', label: 'Phone', kind: 'text' },
  { field: 'bio', label: 'Bio', kind: 'text' },
  { field: 'roles', label: 'Role', kind: 'role' },
  { field: 'engagement.engagementScore', label: 'Engagement score', kind: 'score' },
  { field: 'engagement.membershipStage', label: 'Membership stage', kind: 'stage' },
  { field: 'engagement.riskLevel', label: 'Risk level', kind: 'risk' },
  { field: 'createdAt', label: 'Joined', kind: 'date' },
  { field: 'lastLoginAt', label: 'Last login', kind: 'date' },
  { field: 'isActive', label: 'Status', kind: 'active' },
];

export const OPERATOR_LABELS: Record<SearchOperator, string> = {
  contains: 'contains',
  equals: 'equals',
  startsWith: 'starts with',
  isEmpty: 'is empty',
  includes: 'includes',
  gt: 'greater than',
  gte: 'at least',
  lt: 'less than',
  lte: 'at most',
  between: 'between',
  in: 'is one of',
  before: 'before',
  after: 'after',
};

export const ROLE_OPTIONS = ['admin', 'leader', 'member'] as const;
export const STAGE_OPTIONS = [
  'leader',
  'core_member',
  'active_member',
  'new_member',
  'visitor',
  'at_risk',
  'inactive',
] as const;
export const RISK_OPTIONS = ['low', 'medium', 'high'] as const;

export function fieldKind(field: SearchField): FieldKind {
  return SEARCH_FIELDS.find((f) => f.field === field)?.kind ?? 'text';
}

export function fieldLabel(field: SearchField): string {
  return SEARCH_FIELDS.find((f) => f.field === field)?.label ?? field;
}

export function operatorsFor(field: SearchField): readonly SearchOperator[] {
  return SEARCH_FIELD_OPERATORS[field];
}

/** Choices for the enum-like fields, as [value, label] pairs. */
/** `core_member` -> `Core Member`. */
export function optionLabel(value: string): string {
  return value
    .split('_')
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ');
}

export function optionsFor(kind: FieldKind): [string, string][] {
  if (kind === 'role') return ROLE_OPTIONS.map((r) => [r, optionLabel(r)]);
  if (kind === 'stage') return STAGE_OPTIONS.map((s) => [s, optionLabel(s)]);
  if (kind === 'risk') return RISK_OPTIONS.map((r) => [r, optionLabel(r)]);
  if (kind === 'active')
    return [
      ['true', 'Active'],
      ['false', 'Inactive'],
    ];
  return [];
}

export interface DraftCondition {
  /** A stable React key; not sent. */
  key: string;
  field: SearchField;
  operator: SearchOperator;
  /** The value, or the low end of `between`. */
  value: string;
  /** The high end of `between`. */
  value2: string;
  /** The choices of `in`. */
  values: string[];
}

let nextKey = 0;
const newKey = () => `c${++nextKey}`;

export function newDraft(field: SearchField = 'name'): DraftCondition {
  return {
    key: newKey(),
    field,
    operator: operatorsFor(field)[0]!,
    value: '',
    value2: '',
    values: [],
  };
}

/** Changing the field picks its first operator and clears the values. */
export function withField(draft: DraftCondition, field: SearchField): DraftCondition {
  return { ...newDraft(field), key: draft.key };
}

const isBlank = (value: string) => value.trim() === '';

/** A message when the draft is missing a value, before the schema runs. */
function missingValue(draft: DraftCondition): string | null {
  if (draft.operator === 'isEmpty') return null;
  if (draft.operator === 'in') return draft.values.length ? null : 'Choose at least one value';
  if (draft.operator === 'between')
    return isBlank(draft.value) || isBlank(draft.value2) ? 'Enter both values' : null;
  return isBlank(draft.value) ? 'Enter a value' : null;
}

/** The condition a draft describes (not yet validated). */
function toCandidate(draft: DraftCondition): unknown {
  const { field, operator } = draft;
  const kind = fieldKind(field);
  const scalar = (raw: string): unknown => {
    if (kind === 'score') return Number(raw);
    if (kind === 'active') return raw === 'true';
    return raw.trim();
  };
  if (operator === 'isEmpty') return { field, operator };
  if (operator === 'in') return { field, operator, value: draft.values };
  if (operator === 'between')
    return { field, operator, value: [scalar(draft.value), scalar(draft.value2)] };
  return { field, operator, value: scalar(draft.value) };
}

export type BuildResult =
  { ok: true; query: SearchQuery } | { ok: false; errors: Record<string, string> };

/**
 * Validates each draft with the shared `searchCondition` schema and returns the query, or a
 * message per draft key for the inline errors.
 */
export function buildSearchQuery(drafts: DraftCondition[], logic: 'AND' | 'OR'): BuildResult {
  const errors: Record<string, string> = {};
  const conditions: SearchCondition[] = [];
  for (const draft of drafts) {
    const missing = missingValue(draft);
    if (missing) {
      errors[draft.key] = missing;
      continue;
    }
    const parsed = searchCondition.safeParse(toCandidate(draft));
    if (parsed.success) conditions.push(parsed.data);
    else errors[draft.key] = conditionMessage(fieldKind(draft.field), parsed.error.issues);
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const parsed = searchQuery.safeParse({ conditions, logic });
  if (!parsed.success) return { ok: false, errors: { form: parsed.error.issues[0]!.message } };
  return { ok: true, query: parsed.data };
}

function conditionMessage(kind: FieldKind, issues: { message: string }[]): string {
  const message = issues[0]?.message ?? 'Invalid value';
  if (kind === 'score' && /number/i.test(message)) return 'Enter a number';
  return message;
}

/** Drafts for an existing query, so the builder can edit it. */
export function draftsFromQuery(query: Pick<SearchQuery, 'conditions'>): DraftCondition[] {
  return query.conditions.map((condition) => {
    const draft = { ...newDraft(condition.field), operator: condition.operator };
    if (!('value' in condition)) return draft;
    const value = condition.value as unknown;
    if (condition.operator === 'in') return { ...draft, values: (value as string[]).map(String) };
    if (Array.isArray(value))
      return { ...draft, value: String(value[0]), value2: String(value[1]) };
    return { ...draft, value: String(value) };
  });
}

// Bounds for a one-sided joined range: `between` includes both ends, like the list filter.
const EARLIEST_DATE = '1970-01-01';
const LATEST_DATE = '9999-12-31';
const isSet = (value: string) => value !== '' && value !== 'all';

/**
 * The member list's quick filters as conditions (all combined with AND). The search box
 * matches name, email, phone or bio; on its own it becomes four `contains` conditions with
 * OR, and next to other filters it becomes `name contains` (one query has one logic).
 */
export function filtersToQuery(filters: MemberFilters): SearchQuery | null {
  const search = filters.search.trim();
  const conditions: SearchCondition[] = [];
  if (isSet(filters.role))
    conditions.push({ field: 'roles', operator: 'includes', value: filters.role });
  if (isSet(filters.stage))
    conditions.push({
      field: 'engagement.membershipStage',
      operator: 'equals',
      value: filters.stage as (typeof STAGE_OPTIONS)[number],
    });
  if (isSet(filters.risk))
    conditions.push({
      field: 'engagement.riskLevel',
      operator: 'equals',
      value: filters.risk as (typeof RISK_OPTIONS)[number],
    });
  if (filters.status === 'active' || filters.status === 'inactive')
    conditions.push({ field: 'isActive', operator: 'equals', value: filters.status === 'active' });
  const datesValid = dateRangeError(filters.joinedFrom, filters.joinedTo) === null;
  if (datesValid && (filters.joinedFrom || filters.joinedTo))
    conditions.push({
      field: 'createdAt',
      operator: 'between',
      value: [filters.joinedFrom || EARLIEST_DATE, filters.joinedTo || LATEST_DATE],
    });
  if (search && conditions.length === 0) {
    const textFields = ['name', 'email', 'phone', 'bio'] as const;
    return {
      conditions: textFields.map((field) => ({ field, operator: 'contains', value: search })),
      logic: 'OR',
    };
  }
  if (search) conditions.unshift({ field: 'name', operator: 'contains', value: search });
  if (conditions.length === 0) return null;
  const parsed = searchQuery.safeParse({ conditions, logic: 'AND' });
  return parsed.success ? parsed.data : null;
}

function valueText(condition: SearchCondition): string {
  if (!('value' in condition)) return '';
  const kind = fieldKind(condition.field);
  const one = (v: unknown) => {
    if (kind === 'stage' || kind === 'risk' || kind === 'role') return optionLabel(String(v));
    if (kind === 'active') return v ? 'Active' : 'Inactive';
    return String(v);
  };
  const value = condition.value as unknown;
  if (condition.operator === 'between') {
    const [low, high] = value as [unknown, unknown];
    return `${one(low)} and ${one(high)}`;
  }
  if (Array.isArray(value)) return value.map(one).join(', ');
  return one(value);
}

/** One line per query, for the "Advanced query active" chip: `Name contains ann AND ...`. */
export function describeQuery(query: Pick<SearchQuery, 'conditions' | 'logic'>): string {
  return query.conditions
    .map((c) =>
      [fieldLabel(c.field), OPERATOR_LABELS[c.operator], valueText(c)].filter(Boolean).join(' '),
    )
    .join(` ${query.logic} `);
}
