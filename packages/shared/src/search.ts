import { z } from 'zod';
import { membershipStage, riskLevel } from './enums';
import { MAX_PAGE_SIZE } from './primitives';

// The advanced member search (POST /api/users/search) and the shape stored by saved searches.
// Each condition names a field, an operator allowed for that field and a value of the right type.

export const TEXT_SEARCH_FIELDS = ['name', 'email', 'phone', 'bio'] as const;
export const DATE_SEARCH_FIELDS = ['createdAt', 'lastLoginAt'] as const;

const textField = z.enum(TEXT_SEARCH_FIELDS);
const dateField = z.enum(DATE_SEARCH_FIELDS);
const text = z.string().trim().min(1).max(200);
const score = z.number().finite();
// A calendar date (2026-01-31) or a full ISO timestamp with an offset.
const isoDate = z.union([z.iso.date(), z.iso.datetime({ offset: true })], {
  error: 'Must be an ISO date (YYYY-MM-DD) or timestamp',
});

const ordered = <T extends z.ZodType>(item: T) => z.tuple([item, item]);

const textCondition = z.discriminatedUnion('operator', [
  z.object({ field: textField, operator: z.literal('contains'), value: text }),
  z.object({ field: textField, operator: z.literal('equals'), value: text }),
  z.object({ field: textField, operator: z.literal('startsWith'), value: text }),
  // isEmpty matches a missing or blank value and takes no value.
  z.object({ field: textField, operator: z.literal('isEmpty') }),
]);

const rolesCondition = z.object({
  field: z.literal('roles'),
  operator: z.literal('includes'),
  value: z.string().trim().min(1).max(100),
});

const scoreField = z.literal('engagement.engagementScore');
const scoreCondition = z.discriminatedUnion('operator', [
  z.object({ field: scoreField, operator: z.enum(['gt', 'gte', 'lt', 'lte']), value: score }),
  z.object({ field: scoreField, operator: z.literal('between'), value: ordered(score) }),
]);

const enumCondition = <F extends string, E extends z.ZodEnum>(field: F, values: E) => {
  const fieldSchema = z.literal(field);
  return z.discriminatedUnion('operator', [
    z.object({ field: fieldSchema, operator: z.literal('equals'), value: values }),
    z.object({ field: fieldSchema, operator: z.literal('in'), value: z.array(values).min(1) }),
  ]);
};
const stageCondition = enumCondition('engagement.membershipStage', membershipStage);
const riskCondition = enumCondition('engagement.riskLevel', riskLevel);

const dateCondition = z.discriminatedUnion('operator', [
  z.object({ field: dateField, operator: z.enum(['before', 'after']), value: isoDate }),
  z.object({ field: dateField, operator: z.literal('between'), value: ordered(isoDate) }),
]);

const activeCondition = z.object({
  field: z.literal('isActive'),
  operator: z.literal('equals'),
  value: z.boolean(),
});

export const searchCondition = z.discriminatedUnion('field', [
  textCondition,
  rolesCondition,
  scoreCondition,
  stageCondition,
  riskCondition,
  dateCondition,
  activeCondition,
]);

// Every field the search accepts and the operators allowed on it.
export const SEARCH_FIELD_OPERATORS = {
  name: ['contains', 'equals', 'startsWith', 'isEmpty'],
  email: ['contains', 'equals', 'startsWith', 'isEmpty'],
  phone: ['contains', 'equals', 'startsWith', 'isEmpty'],
  bio: ['contains', 'equals', 'startsWith', 'isEmpty'],
  roles: ['includes'],
  'engagement.engagementScore': ['gt', 'gte', 'lt', 'lte', 'between'],
  'engagement.membershipStage': ['equals', 'in'],
  'engagement.riskLevel': ['equals', 'in'],
  createdAt: ['before', 'after', 'between'],
  lastLoginAt: ['before', 'after', 'between'],
  isActive: ['equals'],
} as const satisfies Record<SearchCondition['field'], readonly SearchCondition['operator'][]>;

// Sort keys for the member list and the search.
export const userSortField = z.enum([
  'name',
  'email',
  'createdAt',
  'lastLoginAt',
  'engagementScore',
  'membershipStage',
]);
export const sortOrder = z.enum(['asc', 'desc']);
export const DEFAULT_USER_PAGE_SIZE = 25;

export const searchQuery = z.object({
  conditions: z.array(searchCondition).min(1).max(10),
  logic: z.enum(['AND', 'OR']),
  sort: userSortField.optional(),
  order: sortOrder.optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

// Query string of GET /api/users (all values arrive as strings). Members may only use q, sort=name,
// order, page and pageSize; the API answers 403 for the staff-only filters and sorts.
export const listUsersQuery = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  role: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  stage: membershipStage.optional(),
  risk: riskLevel.optional(),
  // Inclusive calendar dates (UTC) of the account's creation.
  joinedFrom: z.iso.date().optional(),
  joinedTo: z.iso.date().optional(),
  sort: userSortField.optional(),
  order: sortOrder.optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_USER_PAGE_SIZE),
});

// The list filters only staff may use.
export const STAFF_ONLY_LIST_FILTERS = [
  'role',
  'status',
  'stage',
  'risk',
  'joinedFrom',
  'joinedTo',
] as const satisfies readonly (keyof z.infer<typeof listUsersQuery>)[];

export type SearchCondition = z.infer<typeof searchCondition>;
export type SearchField = SearchCondition['field'];
export type SearchOperator = SearchCondition['operator'];
export type UserSortField = z.infer<typeof userSortField>;
export type SortOrder = z.infer<typeof sortOrder>;
export type SearchQuery = z.infer<typeof searchQuery>;
export type ListUsersQuery = z.input<typeof listUsersQuery>;
