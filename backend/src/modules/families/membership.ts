import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import {
  FAMILY_RELATIVES_NOT_MEMBERS,
  type FamilyMembershipResult,
  type FamilyRelationshipEntry,
  type setFamilyRelationshipInput,
} from '@embrace/shared';
import { audit, type AuditActor } from '../../lib/audit';
import { fieldError, HttpError } from '../../lib/http-error';
import { prisma } from '../../lib/prisma';
import { normaliseFamilyPair, relationOfOther } from './pairs';
import {
  findFamily,
  inOtherFamily,
  isUniqueViolation,
  lockFamilies,
  toMember,
  toRelationship,
  type RelationshipRow,
} from './service';

// Family membership and relationships (PHASE5_SPECS.md G4), staff only. A user belongs to at most
// one family (users.familyId). Leaving a family deletes the leaver's relationships in it and
// clears the head when they were the head. Relationships join two different members of the same
// family and are stored once per pair. Each write locks its families first (lockFamilies), so
// concurrent writes to one family cannot break these rules between their reads and writes.

const USER_NOT_FOUND = 'User not found';
const NOT_A_MEMBER = 'This person is not in the family';
const RELATIONSHIP_NOT_FOUND = 'Relationship not found';
const MOVE_RACED = 'The family changed while saving; reload and try again';

const memberSelect = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  familyId: true,
  family: { select: { familyName: true, headOfFamilyId: true } },
} satisfies Prisma.UserSelect;

// Removes userId from familyId (locked by the caller): their relationships in it are deleted and the head is cleared
// when it was them. Returns what was removed, for the audit event.
async function leave(tx: Prisma.TransactionClient, familyId: string, userId: string) {
  const { count: relationships } = await tx.familyRelationship.deleteMany({
    where: { familyId, OR: [{ primaryUserId: userId }, { relatedUserId: userId }] },
  });
  const { count: wasHead } = await tx.family.updateMany({
    where: { id: familyId, headOfFamilyId: userId },
    data: { headOfFamilyId: null },
  });
  return { relationships, wasHead: wasHead > 0 };
}

/**
 * PUT /api/families/:id/members/:userId. Already a member: nothing changes. In another family:
 * 409 unless `move`, which first takes them out of the old family (audited there too).
 */
export async function putMember(
  actor: AuditActor,
  familyId: string,
  userId: string,
  move: boolean,
): Promise<FamilyMembershipResult> {
  return prisma.$transaction(async (tx) => {
    // Both the target family and the one they leave are locked (in id order) before the user is
    // read again: a move out of a family they have meanwhile left is refused below.
    const seen = await tx.user.findUnique({ where: { id: userId }, select: { familyId: true } });
    const locked = await lockFamilies(tx, familyId, seen?.familyId);
    const family = await findFamily(tx, familyId);
    const user = await tx.user.findUnique({ where: { id: userId }, select: memberSelect });
    if (!user) throw new HttpError(404, USER_NOT_FOUND);
    if (user.familyId === familyId)
      return { member: toMember(user, family.headOfFamilyId), movedFrom: null };
    const old = user.familyId && user.family ? { id: user.familyId, ...user.family } : null;
    if (old && !move) throw inOtherFamily(user.name, old.familyName);
    if (old && !locked.has(old.id)) throw new HttpError(409, MOVE_RACED, 'CONFLICT');

    // Only if they are still where we read them: a concurrent move is refused, not overwritten.
    const { count } = await tx.user.updateMany({
      where: { id: userId, familyId: user.familyId },
      data: { familyId },
    });
    if (count === 0) {
      // Placed in a family since the read above (createFamily does not lock the user's family).
      const now = await tx.user.findUnique({ where: { id: userId }, select: memberSelect });
      if (!move && now?.family) throw inOtherFamily(user.name, now.family.familyName);
      throw new HttpError(409, MOVE_RACED, 'CONFLICT');
    }
    const memberMeta = { memberId: user.id, memberName: user.name };
    if (old) {
      const removed = await leave(tx, old.id, userId);
      await audit(
        tx,
        actor,
        'family_member_removed',
        { type: 'family', id: old.id },
        {
          count: removed.relationships,
          metadata: {
            name: old.familyName,
            ...memberMeta,
            ...removed,
            movedTo: { id: familyId, name: family.familyName },
          },
        },
      );
    }
    await audit(
      tx,
      actor,
      'family_member_added',
      { type: 'family', id: familyId },
      {
        metadata: {
          name: family.familyName,
          ...memberMeta,
          ...(old ? { movedFrom: { id: old.id, name: old.familyName } } : {}),
        },
      },
    );
    return {
      member: toMember(user, family.headOfFamilyId),
      movedFrom: old ? { id: old.id, familyName: old.familyName } : null,
    };
  });
}

/** DELETE /api/families/:id/members/:userId. */
export function removeMember(actor: AuditActor, familyId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const family = await findFamily(tx, familyId);
    const user = await tx.user.findUnique({ where: { id: userId }, select: memberSelect });
    if (!user || user.familyId !== familyId) throw new HttpError(404, NOT_A_MEMBER);
    const removed = await leave(tx, familyId, userId);
    await tx.user.update({ where: { id: userId }, data: { familyId: null } });
    await audit(
      tx,
      actor,
      'family_member_removed',
      { type: 'family', id: familyId },
      {
        count: removed.relationships,
        metadata: { name: family.familyName, memberId: userId, memberName: user.name, ...removed },
      },
    );
    return removed;
  });
}

const relationshipSelect = {
  id: true,
  familyId: true,
  primaryUserId: true,
  relatedUserId: true,
  relationshipType: true,
  isActive: true,
  primaryUser: { select: { id: true, name: true } },
  relatedUser: { select: { id: true, name: true } },
} satisfies Prisma.FamilyRelationshipSelect;

/**
 * PUT /api/families/:id/relationships: `userId` is the `type` of `relatedUserId`. Both must be
 * members of the family. Upserts the stored pair (active); an unchanged pair writes nothing.
 */
export async function setRelationship(
  actor: AuditActor,
  familyId: string,
  body: z.output<typeof setFamilyRelationshipInput>,
): Promise<FamilyRelationshipEntry> {
  try {
    return await prisma.$transaction(async (tx) => {
      const family = await findFamily(tx, familyId);
      const people = await tx.user.findMany({
        where: { id: { in: [body.userId, body.relatedUserId] }, familyId },
        select: { id: true, name: true },
      });
      if (people.length !== 2) throw fieldError('relatedUserId', FAMILY_RELATIVES_NOT_MEMBERS);
      const pair = normaliseFamilyPair({
        primaryUserId: body.userId,
        relatedUserId: body.relatedUserId,
        relationshipType: body.type,
      });
      const where = {
        primaryUserId_relatedUserId: {
          primaryUserId: pair.primaryUserId,
          relatedUserId: pair.relatedUserId,
        },
      };
      const before = await tx.familyRelationship.findUnique({ where, select: relationshipSelect });
      if (
        before?.relationshipType === pair.relationshipType &&
        before.isActive &&
        before.familyId === familyId
      )
        return toRelationship(before);
      const data = { familyId, relationshipType: pair.relationshipType, isActive: true };
      const row: RelationshipRow = await tx.familyRelationship.upsert({
        where,
        create: { ...pair, ...data },
        update: data,
        select: relationshipSelect,
      });
      const name = (id: string) => people.find((p) => p.id === id)!.name;
      await audit(
        tx,
        actor,
        'family_relationship_set',
        { type: 'family', id: familyId },
        {
          metadata: {
            name: family.familyName,
            relationshipId: row.id,
            userId: body.userId,
            userName: name(body.userId),
            relatedUserId: body.relatedUserId,
            relatedUserName: name(body.relatedUserId),
            type: body.type,
            // The previous stored relation, from the same side as `type`.
            previousType: before ? relationOfOther(before, body.relatedUserId) : null,
          },
        },
      );
      return toRelationship(row);
    });
  } catch (err) {
    // Two concurrent first writes of the same pair: the unique index refuses the second.
    if (isUniqueViolation(err))
      throw new HttpError(
        409,
        'This relationship was just saved; reload and try again',
        'CONFLICT',
      );
    throw err;
  }
}

/** DELETE /api/families/:id/relationships/:relationshipId: only a relationship of this family. */
export function removeRelationship(actor: AuditActor, familyId: string, relationshipId: string) {
  return prisma.$transaction(async (tx) => {
    const family = await findFamily(tx, familyId);
    const row = await tx.familyRelationship.findFirst({
      where: { id: relationshipId, familyId },
      select: relationshipSelect,
    });
    if (!row) throw new HttpError(404, RELATIONSHIP_NOT_FOUND);
    await tx.familyRelationship.delete({ where: { id: row.id } });
    await audit(
      tx,
      actor,
      'family_relationship_removed',
      { type: 'family', id: familyId },
      {
        metadata: {
          name: family.familyName,
          relationshipId: row.id,
          userId: row.primaryUserId,
          userName: row.primaryUser.name,
          relatedUserId: row.relatedUserId,
          relatedUserName: row.relatedUser.name,
          type: row.relationshipType,
        },
      },
    );
  });
}
