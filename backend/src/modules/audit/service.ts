import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { AuditEvent, listAuditQuery } from '@embrace/shared';
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

function toEvent(row: EventRow, userNames: Map<string, string>): AuditEvent {
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;
  const userName =
    row.targetType === 'user' && row.targetId ? userNames.get(row.targetId) : undefined;
  return {
    ...row,
    metadata,
    targetName: userName ?? recordedName(row.metadata),
    createdAt: row.createdAt.toISOString(),
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
  // Users are named as they are called now; an account deleted since has no name.
  const userIds = [
    ...new Set(rows.filter((r) => r.targetType === 'user' && r.targetId).map((r) => r.targetId!)),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const userNames = new Map(users.map((u) => [u.id, u.name]));
  return { events: rows.map((row) => toEvent(row, userNames)), total, page, pageSize };
}
