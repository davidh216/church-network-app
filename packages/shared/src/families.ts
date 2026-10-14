import { z } from 'zod';
import { relationshipType, type RelationshipType } from './enums.js';
import {
  cuid,
  MAX_PAGE,
  MAX_PAGE_SIZE,
  MAX_QUERY_TEXT,
  optionalQueryText,
  optionalText,
  requiredText,
  type WithNumericPaging,
} from './primitives.js';

// Families (PHASE5_SPECS.md G4). Staff see and edit every family and its relationships; admins
// delete families; every signed-in user reads their own family's names and relationships
// (GET /api/families/mine), never relatives' contact details.
//
// A relationship is stored once per pair; `type` in the API is always `userId`'s relation to
// `relatedUserId` ("Ann is the parent of Ben").

export const MAX_FAMILY_NAME = 100;
export const MAX_FAMILY_ADDRESS = 200;
export const MAX_FAMILY_CITY = 100;
export const MAX_FAMILY_STATE = 100;
export const MAX_FAMILY_ZIP = 20;
export const MAX_FAMILY_COUNTRY = 100;
export const DEFAULT_FAMILY_PAGE_SIZE = 25;

export const FAMILY_HEAD_NOT_MEMBER = 'The head of family must be a member of the family';
export const FAMILY_RELATIVES_NOT_MEMBERS = 'Both people must be members of this family';
export const FAMILY_SAME_PERSON = 'Choose two different people';
/** The 409 code of PUT /api/families/:id/members/:userId for someone in another family. */
export const FAMILY_MEMBER_ELSEWHERE = 'IN_OTHER_FAMILY';

const familyName = requiredText('Family name', MAX_FAMILY_NAME);
const addressFields = {
  address: optionalText('Address', MAX_FAMILY_ADDRESS),
  city: optionalText('City', MAX_FAMILY_CITY),
  state: optionalText('State', MAX_FAMILY_STATE),
  zipCode: optionalText('ZIP code', MAX_FAMILY_ZIP),
  country: optionalText('Country', MAX_FAMILY_COUNTRY),
};
export const FAMILY_ADDRESS_FIELDS = ['address', 'city', 'state', 'zipCode', 'country'] as const;

// POST /api/families (staff). A new family has no members yet: `headOfFamilyId`, when given,
// joins the new family as its first member and head (409 when they belong to another family).
export const createFamilyInput = z.object({
  familyName,
  ...addressFields,
  headOfFamilyId: cuid.nullable().optional(),
});

// PATCH /api/families/:id (staff): any subset; blank address fields clear, a null head clears.
export const updateFamilyInput = z.object({
  familyName: familyName.optional(),
  ...addressFields,
  headOfFamilyId: cuid.nullable().optional(),
});

// Query string of GET /api/families (staff): name search and paging, by name.
export const listFamiliesQuery = z.object({
  q: optionalQueryText('Search', MAX_QUERY_TEXT),
  page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_FAMILY_PAGE_SIZE),
});

// PUT /api/families/:id/members/:userId (staff). Someone in another family is a 409 unless
// `move` is true; a move deletes their relationships in the old family. The body is optional.
export const putFamilyMemberInput = z
  .object({ move: z.boolean({ error: 'Move must be true or false' }).optional() })
  .optional();

// PUT /api/families/:id/relationships (staff): upserts the pair; `type` is userId's relation to
// relatedUserId.
export const setFamilyRelationshipInput = z
  .object({ userId: cuid, relatedUserId: cuid, type: relationshipType })
  .refine((v) => v.userId !== v.relatedUserId, {
    message: FAMILY_SAME_PERSON,
    path: ['relatedUserId'],
  });

export type CreateFamilyInput = z.input<typeof createFamilyInput>;
export type UpdateFamilyInput = z.input<typeof updateFamilyInput>;
export type ListFamiliesQuery = z.input<typeof listFamiliesQuery>;
export type ListFamiliesParams = WithNumericPaging<ListFamiliesQuery>;
export type PutFamilyMemberInput = z.input<typeof putFamilyMemberInput>;
export type SetFamilyRelationshipInput = z.input<typeof setFamilyRelationshipInput>;

export interface FamilyPerson {
  id: string;
  name: string;
}

/** One row of the staff family list. */
export interface FamilySummary {
  id: string;
  familyName: string;
  city: string | null;
  head: FamilyPerson | null;
  memberCount: number;
  updatedAt: string;
}

/** GET /api/families (staff). */
export interface FamilyList {
  families: FamilySummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** A member of a family as staff see it. */
export interface FamilyMember extends FamilyPerson {
  email: string;
  /** False when the account is deactivated. */
  isActive: boolean;
  isHead: boolean;
}

/**
 * One stored relationship, expressed from both sides: `user` is the `type` of `relatedUser`, and
 * `relatedUser` is the `inverseType` of `user` (Ann is the parent of Ben; Ben is the child of Ann).
 */
export interface FamilyRelationshipEntry {
  id: string;
  user: FamilyPerson;
  relatedUser: FamilyPerson;
  type: RelationshipType;
  inverseType: RelationshipType;
  isActive: boolean;
}

/** GET /api/families/:id (staff). */
export interface FamilyDetail {
  id: string;
  familyName: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
  head: FamilyPerson | null;
  /** By name. */
  members: FamilyMember[];
  /** Every stored relationship of the family, by the first person's name. */
  relationships: FamilyRelationshipEntry[];
  createdAt: string;
  updatedAt: string;
}

/** PUT /api/families/:id/members/:userId: the member, and the family they left when moved. */
export interface FamilyMembershipResult {
  member: FamilyMember;
  movedFrom: { id: string; familyName: string } | null;
}

/** A relative as the signed-in user sees them: a name and how they are related, nothing else. */
export interface OwnFamilyRelative {
  name: string;
  /** The relative's relation to the caller (their parent, spouse, ...); null when none is set. */
  relationship: RelationshipType | null;
}

/** GET /api/families/mine: the caller's family, or null when they have none. */
export interface OwnFamily {
  familyName: string;
  /** The other members, by name. */
  relatives: OwnFamilyRelative[];
}
