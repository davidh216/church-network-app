import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { listUsersQuery, SearchCondition, searchQuery, UserSortField } from '@embrace/shared';
import { DEFAULT_USER_PAGE_SIZE } from '@embrace/shared';

// Translates the validated member list query and the advanced search into Prisma arguments.
// Text matching is case-insensitive; calendar dates are UTC days.

type ListQuery = z.output<typeof listUsersQuery>;
type SearchQuery = z.output<typeof searchQuery>;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// The first instant of a date (midnight UTC for a calendar date) or the timestamp itself.
const startOf = (value: string) => new Date(value);
const isDate = (value: string) => DATE_ONLY.test(value);
// The first instant of the day after a calendar date.
const nextDay = (value: string) => new Date(new Date(value).getTime() + DAY_MS);

// `before` excludes the given day; `after` excludes it too; `between` includes both ends.
function dateFilter(operator: 'before' | 'after' | 'between', value: string | [string, string]) {
  if (operator === 'before') return { lt: startOf(value as string) };
  if (operator === 'after') {
    const v = value as string;
    return isDate(v) ? { gte: nextDay(v) } : { gt: startOf(v) };
  }
  const [low, high] = value as [string, string];
  return { gte: startOf(low), ...(isDate(high) ? { lt: nextDay(high) } : { lte: startOf(high) }) };
}

const insensitive = 'insensitive' as const;

export function conditionWhere(condition: SearchCondition): Prisma.UserWhereInput {
  switch (condition.field) {
    case 'name':
    case 'email':
    case 'phone':
    case 'bio': {
      const { field } = condition;
      if (condition.operator === 'isEmpty') {
        // name and email are required columns, so only a blank value can match them.
        return field === 'phone' || field === 'bio'
          ? { OR: [{ [field]: null }, { [field]: '' }] }
          : { [field]: '' };
      }
      return { [field]: { [condition.operator]: condition.value, mode: insensitive } };
    }
    case 'roles':
      return {
        roles: { some: { role: { name: { equals: condition.value, mode: insensitive } } } },
      };
    case 'engagement.engagementScore': {
      const engagementScore =
        condition.operator === 'between'
          ? { gte: condition.value[0], lte: condition.value[1] }
          : { [condition.operator]: condition.value };
      return { engagement: { is: { engagementScore } } };
    }
    case 'engagement.membershipStage':
    case 'engagement.riskLevel': {
      const column = condition.field === 'engagement.riskLevel' ? 'riskLevel' : 'membershipStage';
      const filter =
        condition.operator === 'in' ? { in: condition.value } : { equals: condition.value };
      return { engagement: { is: { [column]: filter } } };
    }
    case 'createdAt':
    case 'lastLoginAt':
      return { [condition.field]: dateFilter(condition.operator, condition.value) };
    case 'isActive':
      return { isActive: condition.value };
  }
}

export function searchWhere(query: SearchQuery): Prisma.UserWhereInput {
  const parts = query.conditions.map(conditionWhere);
  return query.logic === 'AND' ? { AND: parts } : { OR: parts };
}

// Filters of GET /api/users. Members see active accounts only and match on the name only.
export function listWhere(query: ListQuery, staff: boolean): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [];
  if (!staff) and.push({ isActive: true });
  if (query.q) {
    const contains = { contains: query.q, mode: insensitive };
    and.push(
      staff
        ? {
            OR: [{ name: contains }, { email: contains }, { phone: contains }, { bio: contains }],
          }
        : { name: contains },
    );
  }
  if (query.role)
    and.push({ roles: { some: { role: { name: { equals: query.role, mode: insensitive } } } } });
  if (query.status) and.push({ isActive: query.status === 'active' });
  if (query.stage) and.push({ engagement: { is: { membershipStage: query.stage } } });
  if (query.risk) and.push({ engagement: { is: { riskLevel: query.risk } } });
  if (query.joinedFrom || query.joinedTo) {
    and.push({
      createdAt: {
        ...(query.joinedFrom ? { gte: startOf(query.joinedFrom) } : {}),
        ...(query.joinedTo ? { lt: nextDay(query.joinedTo) } : {}),
      },
    });
  }
  return { AND: and };
}

// Sorts by the requested key, then by name and id so pages are stable. Users who never signed
// in sort last either way.
export function orderBy(
  sort: UserSortField = 'name',
  order: 'asc' | 'desc' = 'asc',
): Prisma.UserOrderByWithRelationInput[] {
  const primary: Prisma.UserOrderByWithRelationInput = (() => {
    switch (sort) {
      case 'engagementScore':
        return { engagement: { engagementScore: order } };
      case 'membershipStage':
        return { engagement: { membershipStage: order } };
      case 'lastLoginAt':
        return { lastLoginAt: { sort: order, nulls: 'last' } };
      default:
        return { [sort]: order };
    }
  })();
  return [primary, { name: 'asc' }, { id: 'asc' }];
}

export function paging(page = 1, pageSize = DEFAULT_USER_PAGE_SIZE) {
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
