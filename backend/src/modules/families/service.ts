import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import {
  FAMILY_HEAD_NOT_MEMBER,
  FAMILY_MEMBER_ELSEWHERE,
  type createFamilyInput,
  type FamilyDetail,
  type FamilyList,
  type FamilyMember,
  type FamilyRelationshipEntry,
  type FamilySummary,
  type listFamiliesQuery,
  type OwnFamily,
  type updateFamilyInput,
} from '@embrace/shared';
import { audit, type AuditActor } from '../../lib/audit';
import { fieldError, HttpError } from '../../lib/http-error';
import { escapeLike } from '../../lib/like';
import { prisma } from '../../lib/prisma';
import { inverseRelationship, relationOfOther } from './pairs';

// Families (PHASE5_SPECS.md G4). Staff list, read and edit every family; admins delete them.
// Every signed-in user reads their own family through ownFamily(), names and relationships only.
// Every staff write is audited in its own transaction, with the family's name in metadata.name.
// Membership and relationship writes live in membership.ts.

export const FAMILY_NOT_FOUND = 'Family not found';

export type Changes = Record<
  string,
  { from: Prisma.InputJsonValue | null; to: Prisma.InputJsonValue | null }
>;

const person = { select: { id: true, name: true } } as const;

const summarySelect = {
  id: true,
  familyName: true,
  city: true,
  updatedAt: true,
  headOfFamily: person,
  _count: { select: { members: true } },
} satisfies Prisma.FamilySelect;

const detailSelect = {
  id: true,
  familyName: true,
  address: true,
  city: true,
  state: true,
  zipCode: true,
  country: true,
  headOfFamilyId: true,
  headOfFamily: person,
  createdAt: true,
  updatedAt: true,
  members: {
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, email: true, isActive: true },
  },
  relationships: {
    orderBy: [{ primaryUser: { name: 'asc' } }, { relatedUser: { name: 'asc' } }, { id: 'asc' }],
    select: {
      id: true,
      primaryUserId: true,
      relatedUserId: true,
      relationshipType: true,
      isActive: true,
      primaryUser: person,
      relatedUser: person,
    },
  },
} satisfies Prisma.FamilySelect;

type DetailRow = Prisma.FamilyGetPayload<{ select: typeof detailSelect }>;
export type RelationshipRow = DetailRow['relationships'][number];

const toSummary = (row: Prisma.FamilyGetPayload<{ select: typeof summarySelect }>) =>
  ({
    id: row.id,
    familyName: row.familyName,
    city: row.city,
    head: row.headOfFamily,
    memberCount: row._count.members,
    updatedAt: row.updatedAt.toISOString(),
  }) satisfies FamilySummary;

export const toMember = (
  user: { id: string; name: string; email: string; isActive: boolean },
  headId: string | null,
): FamilyMember => ({
  id: user.id,
  name: user.name,
  email: user.email,
  isActive: user.isActive,
  isHead: user.id === headId,
});

/** A stored pair, from both sides: the primary is `type` of the related user. */
export const toRelationship = (row: RelationshipRow): FamilyRelationshipEntry => ({
  id: row.id,
  user: row.primaryUser,
  relatedUser: row.relatedUser,
  type: row.relationshipType,
  inverseType: inverseRelationship(row.relationshipType),
  isActive: row.isActive,
});

function toDetail(row: DetailRow): FamilyDetail {
  const { headOfFamilyId, headOfFamily, members, relationships, createdAt, updatedAt, ...rest } =
    row;
  return {
    ...rest,
    head: headOfFamily,
    members: members.map((m) => toMember(m, headOfFamilyId)),
    relationships: relationships.map(toRelationship),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

/** The family name search, by name, with member counts and the head's name. */
export async function listFamilies(query: z.output<typeof listFamiliesQuery>): Promise<FamilyList> {
  const where: Prisma.FamilyWhereInput = query.q
    ? { familyName: { contains: escapeLike(query.q), mode: 'insensitive' } }
    : {};
  const { page, pageSize } = query;
  const [rows, total] = await prisma.$transaction([
    prisma.family.findMany({
      where,
      orderBy: [{ familyName: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: summarySelect,
    }),
    prisma.family.count({ where }),
  ]);
  return { families: rows.map(toSummary), total, page, pageSize };
}

export async function getFamily(id: string): Promise<FamilyDetail> {
  const row = await prisma.family.findUnique({ where: { id }, select: detailSelect });
  if (!row) throw new HttpError(404, FAMILY_NOT_FOUND);
  return toDetail(row);
}

/**
 * Locks the given families' rows for the rest of the transaction and returns the ids that exist.
 * Every family write takes this lock before it reads the members, the head or the
 * relationships, so writes to one family run one after another and each sees the last one's
 * result. Several families are locked in id order, so two writers never wait on each other.
 */
export async function lockFamilies(
  tx: Prisma.TransactionClient,
  ...ids: (string | null | undefined)[]
): Promise<Set<string>> {
  const found = new Set<string>();
  for (const id of [...new Set(ids.filter((id): id is string => !!id))].sort()) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "families" WHERE "id" = ${id} FOR UPDATE`;
    if (rows.length > 0) found.add(id);
  }
  return found;
}

/** The family, locked (lockFamilies); 404 when there is none. */
export async function findFamily(tx: Prisma.TransactionClient, id: string) {
  if (!(await lockFamilies(tx, id)).has(id)) throw new HttpError(404, FAMILY_NOT_FOUND);
  const family = await tx.family.findUnique({
    where: { id },
    select: { id: true, familyName: true, headOfFamilyId: true },
  });
  if (!family) throw new HttpError(404, FAMILY_NOT_FOUND);
  return family;
}

// "the Roe family", but "the Smith Family" rather than "the Smith Family family".
const familyTitle = (familyName: string) =>
  /\bfamily$/i.test(familyName.trim()) ? familyName : `${familyName} family`;

export const inOtherFamily = (name: string, familyName: string) =>
  new HttpError(
    409,
    `${name} already belongs to the ${familyTitle(familyName)}`,
    FAMILY_MEMBER_ELSEWHERE,
  );

// A new family. A head, when given, joins it as its first member (they must not belong to
// another family: adding them there with a move is the explicit way).
export async function createFamily(
  actor: AuditActor,
  body: z.output<typeof createFamilyInput>,
): Promise<FamilyDetail> {
  const { headOfFamilyId, ...fields } = body;
  const id = await prisma.$transaction(async (tx) => {
    const head = headOfFamilyId
      ? await tx.user.findUnique({
          where: { id: headOfFamilyId },
          select: { id: true, name: true, family: { select: { familyName: true } } },
        })
      : null;
    if (headOfFamilyId && !head) throw fieldError('headOfFamilyId', 'User not found');
    if (head?.family) throw inOtherFamily(head.name, head.family.familyName);
    const family = await tx.family.create({ data: fields, select: { id: true, familyName: true } });
    await audit(
      tx,
      actor,
      'family_created',
      { type: 'family', id: family.id },
      { metadata: { name: family.familyName } },
    );
    if (head) {
      // Only if they still have no family: a concurrent assignment is refused, not overwritten.
      const { count } = await tx.user.updateMany({
        where: { id: head.id, familyId: null },
        data: { familyId: family.id },
      });
      if (count === 0) {
        const now = await tx.user.findUnique({
          where: { id: head.id },
          select: { family: { select: { familyName: true } } },
        });
        if (!now) throw fieldError('headOfFamilyId', 'User not found');
        if (now.family) throw inOtherFamily(head.name, now.family.familyName);
        throw new HttpError(
          409,
          'The family changed while saving; reload and try again',
          'CONFLICT',
        );
      }
      await tx.family.update({ where: { id: family.id }, data: { headOfFamilyId: head.id } });
      await audit(
        tx,
        actor,
        'family_member_added',
        { type: 'family', id: family.id },
        { metadata: { name: family.familyName, memberId: head.id, memberName: head.name } },
      );
    }
    return family.id;
  });
  return getFamily(id);
}

const EDITABLE = [
  'familyName',
  'address',
  'city',
  'state',
  'zipCode',
  'country',
  'headOfFamilyId',
] as const;

// Name, address and head. The head must be one of the members; null clears it.
// The detail is read after the commit: one nested read with several relations, outside the
// transaction's single connection.
export async function updateFamily(
  actor: AuditActor,
  id: string,
  body: z.output<typeof updateFamilyInput>,
): Promise<FamilyDetail> {
  await prisma.$transaction(async (tx) => {
    if (!(await lockFamilies(tx, id)).has(id)) throw new HttpError(404, FAMILY_NOT_FOUND);
    const before = await tx.family.findUnique({
      where: { id },
      select: {
        familyName: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        country: true,
        headOfFamilyId: true,
        members: { select: { id: true } },
      },
    });
    if (!before) throw new HttpError(404, FAMILY_NOT_FOUND);
    const changes: Changes = {};
    for (const key of EDITABLE) {
      const value = body[key];
      if (value !== undefined && value !== before[key])
        changes[key] = { from: before[key], to: value };
    }
    if (Object.keys(changes).length === 0) return;
    if (body.headOfFamilyId && !before.members.some((m) => m.id === body.headOfFamilyId))
      throw fieldError('headOfFamilyId', FAMILY_HEAD_NOT_MEMBER);
    const row = await tx.family.update({ where: { id }, data: body, select: { familyName: true } });
    await audit(
      tx,
      actor,
      'family_updated',
      { type: 'family', id },
      { metadata: { name: row.familyName, changes } },
    );
  });
  return getFamily(id);
}

// Deleting a family unlinks its members and deletes its relationships (cascade). The event counts
// the members unlinked.
export function deleteFamily(
  actor: AuditActor,
  id: string,
): Promise<{ members: number; relationships: number }> {
  return prisma.$transaction(async (tx) => {
    if (!(await lockFamilies(tx, id)).has(id)) throw new HttpError(404, FAMILY_NOT_FOUND);
    const family = await tx.family.findUnique({
      where: { id },
      select: { familyName: true, _count: { select: { members: true, relationships: true } } },
    });
    if (!family) throw new HttpError(404, FAMILY_NOT_FOUND);
    await tx.user.updateMany({ where: { familyId: id }, data: { familyId: null } });
    await tx.family.delete({ where: { id } });
    const { members, relationships } = family._count;
    await audit(
      tx,
      actor,
      'family_deleted',
      { type: 'family', id },
      { count: members, metadata: { name: family.familyName, members, relationships } },
    );
    return { members, relationships };
  });
}

// The caller's own family: its name, and each other member's name with their active relation to
// the caller within this family. Nothing else (no ids, contact details or address), and no
// deactivated relatives.
export async function ownFamily(userId: string): Promise<OwnFamily | null> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      family: {
        select: {
          id: true,
          familyName: true,
          members: {
            // Only active accounts, as in the member directory.
            where: { id: { not: userId }, isActive: true },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            select: { id: true, name: true },
          },
          relationships: {
            where: { isActive: true, OR: [{ primaryUserId: userId }, { relatedUserId: userId }] },
            select: { primaryUserId: true, relatedUserId: true, relationshipType: true },
          },
        },
      },
    },
  });
  const family = me?.family;
  if (!family) return null;
  const relationOf = new Map(
    family.relationships.map((pair) => [
      pair.primaryUserId === userId ? pair.relatedUserId : pair.primaryUserId,
      relationOfOther(pair, userId),
    ]),
  );
  return {
    familyName: family.familyName,
    relatives: family.members.map((m) => ({
      name: m.name,
      relationship: relationOf.get(m.id) ?? null,
    })),
  };
}

export const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
