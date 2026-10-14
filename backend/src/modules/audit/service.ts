import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { AuditEvent, AuditTargetType, listAuditQuery } from '@embrace/shared';
import { prisma } from '../../lib/prisma';
import { endOfDay } from '../users/search';

// The audit log (PHASE5_SPECS.md G1), read by admins. Newest first; `from` and `to` are
// inclusive calendar days in UTC.

const eventSelect = {
  id: true,
  action: true,
  targetType: true,
  targetId: true,
  count: true,
  metadata: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
} satisfies Prisma.AuditEventSelect;

type EventRow = Prisma.AuditEventGetPayload<{ select: typeof eventSelect }>;

function recordedName(metadata: Prisma.JsonValue): string | null {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const name = metadata.name;
    if (typeof name === 'string') return name;
  }
  return null;
}

/** For each target type, the ids among the page's targets that still exist. */
type Existing = Record<AuditTargetType, Set<string>>;

function toEvent(row: EventRow, userNames: Map<string, string>, existing: Existing): AuditEvent {
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;
  const userName =
    row.targetType === 'user' && row.targetId ? userNames.get(row.targetId) : undefined;
  const ids = existing[row.targetType as AuditTargetType] as Set<string> | undefined;
  return {
    ...row,
    metadata,
    targetName: userName ?? recordedName(row.metadata),
    targetExists: !!row.targetId && !!ids?.has(row.targetId),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Which of the page's targets still exist: one query per target type present on the page (never
 * one per row). Users come back with their current names.
 */
async function lookUpTargets(rows: EventRow[]) {
  const idsOf = (type: AuditTargetType) => [
    ...new Set(rows.filter((r) => r.targetType === type && r.targetId).map((r) => r.targetId!)),
  ];
  const [userIds, tagIds, groupIds, familyIds] = [
    idsOf('user'),
    idsOf('tag'),
    idsOf('group'),
    idsOf('family'),
  ];
  const byId = { select: { id: true } } as const;
  const [users, tags, groups, families] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [],
    tagIds.length ? prisma.memberTag.findMany({ where: { id: { in: tagIds } }, ...byId }) : [],
    groupIds.length ? prisma.group.findMany({ where: { id: { in: groupIds } }, ...byId }) : [],
    familyIds.length ? prisma.family.findMany({ where: { id: { in: familyIds } }, ...byId }) : [],
  ]);
  const set = (found: { id: string }[]) => new Set(found.map((f) => f.id));
  return {
    // Users are named as they are called now; an account deleted since has no name.
    userNames: new Map(users.map((u) => [u.id, u.name])),
    existing: { user: set(users), tag: set(tags), group: set(groups), family: set(families) },
  };
}

export async function listAudit(query: z.output<typeof listAuditQuery>) {
  const where: Prisma.AuditEventWhereInput = {
    actorId: query.actorId,
    action: query.action,
    targetType: query.targetType,
    targetId: query.targetId,
    createdAt: {
      gte: query.from ? new Date(query.from) : undefined,
      lte: query.to ? endOfDay(query.to) : undefined,
    },
  };
  const { page, pageSize } = query;
  const [rows, total] = await prisma.$transaction([
    prisma.auditEvent.findMany({
      where,
      select: eventSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditEvent.count({ where }),
  ]);
  const { userNames, existing } = await lookUpTargets(rows);
  return {
    events: rows.map((row) => toEvent(row, userNames, existing)),
    total,
    page,
    pageSize,
  };
}
