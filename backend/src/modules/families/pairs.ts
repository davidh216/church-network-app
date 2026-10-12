import type { RelationshipType } from '@prisma/client';
import { prisma } from '../../lib/prisma';

// How a family relationship is stored (PHASE3_SPECS.md 1.2, PHASE5_SPECS.md G4): one row per
// pair with primaryUserId < relatedUserId in byte order (JavaScript string order, the order the
// CHECK constraint family_relationships_pair_order_check enforces with COLLATE "C"), and
// relationshipType is the primary's relation to the related user.

const INVERSE_RELATIONSHIP: Record<RelationshipType, RelationshipType> = {
  spouse: 'spouse',
  parent: 'child',
  child: 'parent',
  sibling: 'sibling',
  grandparent: 'grandchild',
  grandchild: 'grandparent',
  other: 'other',
};

/** `a` is the `type` of `b` -> `b` is the inverse type of `a` (parent <-> child, ...). */
export function inverseRelationship(type: RelationshipType): RelationshipType {
  return INVERSE_RELATIONSHIP[type];
}

export interface FamilyPair {
  primaryUserId: string;
  relatedUserId: string;
  /** The primary's relation to the related user. */
  relationshipType: RelationshipType;
}

/**
 * Each family pair is stored once, with primaryUserId < relatedUserId: a pair given the other
 * way round is swapped and its type inverted. (A pair of one user with themself is refused by the
 * callers and by the database.)
 */
export function normaliseFamilyPair(pair: FamilyPair): FamilyPair {
  if (pair.primaryUserId <= pair.relatedUserId) return pair;
  return {
    primaryUserId: pair.relatedUserId,
    relatedUserId: pair.primaryUserId,
    relationshipType: inverseRelationship(pair.relationshipType),
  };
}

/**
 * `relationshipType` of a stored pair as seen from `viewerId`: the other person's relation to
 * the viewer (a stored type is the primary's relation, so it is inverted where the viewer is the
 * primary).
 */
export function relationOfOther(pair: FamilyPair, viewerId: string): RelationshipType {
  return pair.primaryUserId === viewerId
    ? inverseRelationship(pair.relationshipType)
    : pair.relationshipType;
}

/** Records (or updates) the relationship between two members of a family, normalised. */
export function setFamilyRelationship(familyId: string, pair: FamilyPair, isActive = true) {
  const { primaryUserId, relatedUserId, relationshipType } = normaliseFamilyPair(pair);
  return prisma.familyRelationship.upsert({
    where: { primaryUserId_relatedUserId: { primaryUserId, relatedUserId } },
    create: { familyId, primaryUserId, relatedUserId, relationshipType, isActive },
    update: { familyId, relationshipType, isActive },
  });
}
