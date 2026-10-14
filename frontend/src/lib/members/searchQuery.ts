import {
  MEMBERSHIP_STAGES,
  RISK_LEVELS,
  SEARCH_FIELD_OPERATORS,
  searchCondition,
  searchQuery,
  type MembershipStage,
  type RiskLevel,
  type SearchCondition,
  type SearchField,
  type SearchOperator,
  type SearchQuery,
} from '@embrace/shared';
import { enumOptions, stageLabel } from './display';
import { dateRangeError, type MemberFilters } from './filters';
import {
  NO_CHOICES,
  NO_NAMES,
  referenceName,
  type SearchChoices,
  type SearchNames,
} from './searchNames';

/**
 * The advanced member search (POST /api/users/search) as the builder edits it. A draft keeps
 * every value as the inputs hold it (strings); `buildSearchQuery` turns the drafts into a
 * `searchQuery` with the shared schema, so the rules match what the API enforces.
 */

type FieldKind =
  'text' | 'role' | 'score' | 'stage' | 'risk' | 'date' | 'active' | 'tag' | 'group' | 'family';

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
  { field: 'tags', label: 'Tags', kind: 'tag' },
  { field: 'groups', label: 'Groups', kind: 'group' },
  { field: 'family', label: 'Family', kind: 'family' },
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
  includesAny: 'include any of',
  includesAll: 'include all of',
  excludesAll: 'include none of',
  isNotEmpty: 'is not empty',
};

/** Operators that take a list of choices (`values`), and those that take no value. */
const MULTI_OPERATORS: readonly SearchOperator[] = [
  'in',
  'includesAny',
  'includesAll',
  'excludesAll',
];
const isMulti = (operator: SearchOperator) => MULTI_OPERATORS.includes(operator);
/** True for the operators that take no value (`isEmpty`, `isNotEmpty`). */
export const takesNoValue = (operator: SearchOperator) =>
  operator === 'isEmpty' || operator === 'isNotEmpty';
/** True for the operators that take a list of choices. */
export const takesChoices = isMulti;

const ROLE_OPTIONS = ['admin', 'leader', 'member'] as const;

export function fieldKind(field: SearchField): FieldKind {
  return SEARCH_FIELDS.find((f) => f.field === field)?.kind ?? 'text';
}

function fieldLabel(field: SearchField): string {
  return SEARCH_FIELDS.find((f) => f.field === field)?.label ?? field;
}

export function operatorsFor(field: SearchField): readonly SearchOperator[] {
  return SEARCH_FIELD_OPERATORS[field];
}

/**
 * Choices for the enum-like fields, as [value, label] pairs; tags and groups come from the
 * server (`choices`).
 */
export function optionsFor(
  kind: FieldKind,
  choices: SearchChoices = NO_CHOICES,
): [string, string][] {
  if (kind === 'tag') return choices.tag;
  if (kind === 'group') return choices.group;
  if (kind === 'role') return enumOptions(ROLE_OPTIONS);
  if (kind === 'stage') return enumOptions(MEMBERSHIP_STAGES);
  if (kind === 'risk') return enumOptions(RISK_LEVELS);
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
  /** The choices of `in` and of the tag and group operators. */
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
  if (takesNoValue(draft.operator)) return null;
  if (isMulti(draft.operator)) return draft.values.length ? null : 'Choose at least one value';
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
  if (takesNoValue(operator)) return { field, operator };
  if (isMulti(operator)) return { field, operator, value: draft.values };
  if (operator === 'between')
    return { field, operator, value: [scalar(draft.value), scalar(draft.value2)] };
  return { field, operator, value: scalar(draft.value) };
}

type BuildResult = { ok: true; query: SearchQuery } | { ok: false; errors: Record<string, string> };

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
    if (isMulti(condition.operator)) return { ...draft, values: (value as string[]).map(String) };
    if (Array.isArray(value))
      return { ...draft, value: String(value[0]), value2: String(value[1]) };
    return { ...draft, value: String(value) };
  });
}

/** Engagement score conditions for each band of the quick filter (all combined with AND). */
const ENGAGEMENT_CONDITIONS: Record<string, SearchCondition[]> = {
  high: [{ field: 'engagement.engagementScore', operator: 'gte', value: 80 }],
  medium: [
    { field: 'engagement.engagementScore', operator: 'gte', value: 50 },
    { field: 'engagement.engagementScore', operator: 'lt', value: 80 },
  ],
  low: [{ field: 'engagement.engagementScore', operator: 'lt', value: 50 }],
};

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
      value: filters.stage as MembershipStage,
    });
  if (isSet(filters.risk))
    conditions.push({
      field: 'engagement.riskLevel',
      operator: 'equals',
      value: filters.risk as RiskLevel,
    });
  if (filters.status === 'active' || filters.status === 'inactive')
    conditions.push({ field: 'isActive', operator: 'equals', value: filters.status === 'active' });
  conditions.push(...(ENGAGEMENT_CONDITIONS[filters.engagement] ?? []));
  const datesValid = dateRangeError(filters.joinedFrom, filters.joinedTo) === null;
  if (datesValid && (filters.joinedFrom || filters.joinedTo))
    conditions.push({
      field: 'createdAt',
      operator: 'between',
      value: [filters.joinedFrom || EARLIEST_DATE, filters.joinedTo || LATEST_DATE],
    });
  if (isSet(filters.tag))
    conditions.push({ field: 'tags', operator: 'includesAny', value: [filters.tag] });
  if (isSet(filters.group))
    conditions.push({ field: 'groups', operator: 'includesAny', value: [filters.group] });
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

/**
 * True when the quick filters' text search becomes `name contains` (it is combined with other
 * filters, and one query has one logic), so it no longer matches email, phone or bio.
 */
export function searchNarrowedToName(filters: MemberFilters): boolean {
  return filters.search.trim() !== '' && filtersToQuery(filters)?.logic === 'AND';
}

/** Shown when saving quick filters whose text search is narrowed to names. */
export const NAME_ONLY_SAVE_NOTE =
  'The text search is saved as a name match only: next to other filters it matches names, not email, phone or bio.';

/** Shown under the quick filters while the engagement filter narrows the text search. */
export const NAME_ONLY_LIST_NOTE = 'With an engagement filter, the text search matches names only.';

/** One piece of a query's description; `deleted` marks a tag or group that no longer exists. */
export interface QuerySegment {
  text: string;
  deleted?: boolean;
}

function valueSegments(condition: SearchCondition, names: SearchNames): QuerySegment[] {
  if (!('value' in condition)) return [];
  const kind = fieldKind(condition.field);
  if (kind === 'tag' || kind === 'group') {
    const refs = (condition.value as string[]).map((id) => referenceName(names, kind, id));
    return refs.flatMap((ref, i) => [
      ...(i > 0 ? [{ text: ', ' }] : []),
      ref.deleted ? { text: ref.label, deleted: true } : { text: ref.label },
    ]);
  }
  return [{ text: valueText(condition) }];
}

function valueText(condition: SearchCondition): string {
  if (!('value' in condition)) return '';
  const kind = fieldKind(condition.field);
  const one = (v: unknown) => {
    if (kind === 'stage' || kind === 'risk' || kind === 'role') return stageLabel(String(v));
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

/**
 * A query as segments of one line, for the "Advanced query active" chip: `Name contains ann AND
 * Tags include any of Choir, (deleted)`. `names` names the tags and groups.
 */
export function describeQuerySegments(
  query: Pick<SearchQuery, 'conditions' | 'logic'>,
  names: SearchNames = NO_NAMES,
): QuerySegment[] {
  return query.conditions.flatMap((c, i) => {
    const values = valueSegments(c, names);
    const head = [fieldLabel(c.field), OPERATOR_LABELS[c.operator]].join(' ');
    return [
      ...(i > 0 ? [{ text: ` ${query.logic} ` }] : []),
      { text: values.length ? `${head} ` : head },
      ...values,
    ];
  });
}

/** The query as one line of text (see describeQuerySegments). */
export function describeQuery(
  query: Pick<SearchQuery, 'conditions' | 'logic'>,
  names: SearchNames = NO_NAMES,
): string {
  return describeQuerySegments(query, names)
    .map((segment) => segment.text)
    .join('');
}

/** True when the query names a tag or group that no longer exists (once the names have loaded). */
export function referencesDeleted(
  query: Pick<SearchQuery, 'conditions' | 'logic'>,
  names: SearchNames,
): boolean {
  return describeQuerySegments(query, names).some((segment) => segment.deleted);
}
