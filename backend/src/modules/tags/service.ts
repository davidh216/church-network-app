import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import {
  TAG_ARCHIVED,
  TAG_NAME_TAKEN,
  type createTagInput,
  type listTagsQuery,
  type Tag,
  type updateTagInput,
} from '@embrace/shared';
import { audit, type AuditActor } from '../../lib/audit';
import { HttpError } from '../../lib/http-error';
import { escapeLike } from '../../lib/like';
import { prisma } from '../../lib/prisma';

// Member tags (PHASE5_SPECS.md G2), staff only. Names are unique ignoring case: checked here and
// backed by the case-sensitive unique index. Every write is audited in its own transaction.

const TAG_NOT_FOUND = 'Tag not found';

const tagSelect = {
  id: true,
  name: true,
  color: true,
  category: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { memberTags: true } },
} satisfies Prisma.MemberTagSelect;

type TagRow = Prisma.MemberTagGetPayload<{ select: typeof tagSelect }>;

function toTag({ _count, createdAt, updatedAt, ...row }: TagRow): Tag {
  return {
    ...row,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    usageCount: _count.memberTags,
  };
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

// Tag names are checked ignoring case but the unique index is case-sensitive, so two writes of
// "Choir" and "choir" could both pass the check. Every write that sets a name first takes this
// transaction-scoped advisory lock (one key for all tags: names change rarely), so the checks
// run one after another. The key is an arbitrary constant used nowhere else.
const TAG_NAME_LOCK = 5_020_001;
const lockTagNames = (tx: Prisma.TransactionClient) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(${TAG_NAME_LOCK}::bigint)`;

/** 409 when another tag already has this name in any letter case. */
async function assertNameFree(tx: Prisma.TransactionClient, name: string, exceptId?: string) {
  const clash = await tx.memberTag.findFirst({
    where: {
      name: { equals: escapeLike(name), mode: 'insensitive' },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new HttpError(409, TAG_NAME_TAKEN, 'CONFLICT');
}

/** Runs a tag write; a unique violation from a concurrent write of the same name is a 409. */
async function writing<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, TAG_NAME_TAKEN, 'CONFLICT');
    throw err;
  }
}

// Active tags by name (archived ones too on request), with how many members carry each.
export async function listTags(query: z.output<typeof listTagsQuery>): Promise<Tag[]> {
  const rows = await prisma.memberTag.findMany({
    where: query.includeArchived ? {} : { isActive: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: tagSelect,
  });
  return rows.map(toTag);
}

export function createTag(actor: AuditActor, body: z.output<typeof createTagInput>): Promise<Tag> {
  return writing(() =>
    prisma.$transaction(async (tx) => {
      await lockTagNames(tx);
      await assertNameFree(tx, body.name);
      const row = await tx.memberTag.create({ data: body, select: tagSelect });
      await audit(
        tx,
        actor,
        'tag_created',
        { type: 'tag', id: row.id },
        {
          metadata: { name: row.name, color: row.color, category: row.category },
        },
      );
      return toTag(row);
    }),
  );
}

// Archiving (isActive false) is recorded as tag_archived; any other change, restoring an
// archived tag included, as tag_updated. The metadata lists the changed fields' old and new values.
export function updateTag(
  actor: AuditActor,
  id: string,
  body: z.output<typeof updateTagInput>,
): Promise<Tag> {
  return writing(() =>
    prisma.$transaction(async (tx) => {
      const before = await tx.memberTag.findUnique({ where: { id }, select: tagSelect });
      if (!before) throw new HttpError(404, TAG_NOT_FOUND);
      const changes: Record<string, { from: Prisma.InputJsonValue; to: Prisma.InputJsonValue }> =
        {};
      for (const key of ['name', 'color', 'category', 'isActive'] as const) {
        const value = body[key];
        if (value !== undefined && value !== before[key])
          changes[key] = { from: before[key], to: value };
      }
      if (Object.keys(changes).length === 0) return toTag(before);
      if (changes.name) {
        await lockTagNames(tx);
        await assertNameFree(tx, body.name!, id);
      }
      const row = await tx.memberTag.update({ where: { id }, data: body, select: tagSelect });
      const archived = changes.isActive !== undefined && body.isActive === false;
      await audit(
        tx,
        actor,
        archived ? 'tag_archived' : 'tag_updated',
        { type: 'tag', id },
        {
          metadata: { name: row.name, changes },
        },
      );
      return toTag(row);
    }),
  );
}

// Deleting a tag removes it from every member (cascade); the event counts the assignments removed.
export async function deleteTag(actor: AuditActor, id: string): Promise<{ removed: number }> {
  return prisma.$transaction(async (tx) => {
    const tag = await tx.memberTag.findUnique({ where: { id }, select: tagSelect });
    if (!tag) throw new HttpError(404, TAG_NOT_FOUND);
    await tx.memberTag.delete({ where: { id } });
    const removed = tag._count.memberTags;
    await audit(
      tx,
      actor,
      'tag_deleted',
      { type: 'tag', id },
      {
        count: removed,
        metadata: { name: tag.name },
      },
    );
    return { removed };
  });
}

const assignmentSelect = {
  id: true,
  addedAt: true,
  tag: { select: { id: true, name: true, color: true, category: true, isActive: true } },
} satisfies Prisma.UserTagSelect;

/** A member's tags (staff only), archived ones included and marked by `isActive: false`. */
export function memberTags(userId: string) {
  return prisma.userTag.findMany({
    where: { userId },
    orderBy: [{ tag: { name: 'asc' } }, { id: 'asc' }],
    select: assignmentSelect,
  });
}

async function assertUser(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new HttpError(404, 'User not found');
}

// Idempotent: assigning a tag the member already has changes and records nothing. An archived
// tag cannot be newly assigned.
export async function assignTag(actor: AuditActor, userId: string, tagId: string) {
  const added = await prisma.$transaction(async (tx) => {
    await assertUser(tx, userId);
    // FOR SHARE: an archive running now (an UPDATE of this row) commits first, or waits for this
    // assignment to commit, so a tag is never assigned after it was archived.
    const [tag] = await tx.$queryRaw<{ id: string; name: string; isActive: boolean }[]>`
      SELECT "id", "name", "isActive" FROM "member_tags" WHERE "id" = ${tagId} FOR SHARE`;
    if (!tag) throw new HttpError(404, TAG_NOT_FOUND);
    const existing = await tx.userTag.findUnique({
      where: { userId_tagId: { userId, tagId } },
      select: { id: true },
    });
    if (existing) return false;
    if (!tag.isActive) throw new HttpError(400, TAG_ARCHIVED, 'TAG_ARCHIVED');
    const { count } = await tx.userTag.createMany({
      data: [{ userId, tagId, addedById: actor?.id ?? null }],
      skipDuplicates: true,
    });
    if (count === 0) return false;
    await audit(
      tx,
      actor,
      'tag_assigned',
      { type: 'user', id: userId },
      {
        metadata: { tagId, tagName: tag.name },
      },
    );
    return true;
  });
  return { added, memberTags: await memberTags(userId) };
}

export async function unassignTag(actor: AuditActor, userId: string, tagId: string) {
  await prisma.$transaction(async (tx) => {
    await assertUser(tx, userId);
    const assignment = await tx.userTag.findUnique({
      where: { userId_tagId: { userId, tagId } },
      select: { id: true, tag: { select: { name: true } } },
    });
    if (!assignment) throw new HttpError(404, 'This member does not have that tag');
    await tx.userTag.delete({ where: { id: assignment.id } });
    await audit(
      tx,
      actor,
      'tag_unassigned',
      { type: 'user', id: userId },
      {
        metadata: { tagId, tagName: assignment.tag.name },
      },
    );
  });
  return { memberTags: await memberTags(userId) };
}
