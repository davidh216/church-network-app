import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { HttpError } from '../../lib/http-error';
import { isAdmin } from '../../middleware/auth';
import type { AuthenticatedUser } from '../../types/auth';
import type {
  addInteractionBody,
  addMilestoneBody,
  addNoteBody,
  interactionsQuery,
  milestonesQuery,
  notesQuery,
  timelineQuery,
} from './schemas';

// Private notes are visible only to their author and to admins.
function visibleNotes(viewer: AuthenticatedUser): Prisma.MemberNoteWhereInput {
  return isAdmin(viewer) ? {} : { OR: [{ isPrivate: false }, { authorId: viewer.id }] };
}

const relative = { select: { id: true, name: true, firstName: true, lastName: true, avatar: true, isActive: true } };

// The full CRM profile of a member: roles, engagement, family, recent interactions,
// milestones, notes the viewer may see, timeline and tags. Never the password hash.
export async function getMemberDetails(id: string, viewer: AuthenticatedUser) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      roles: { include: { role: true } },
      engagement: true,
      family: true,
      familyRelationships: { include: { relatedUser: relative } },
      relatedFamilyMembers: { include: { primaryUser: relative } },
      interactions: { orderBy: { createdAt: 'desc' }, take: 50 },
      milestones: { orderBy: { achievedDate: 'desc' }, take: 20 },
      memberNotes: { where: visibleNotes(viewer), orderBy: { createdAt: 'desc' }, take: 20 },
      timelineActivities: { orderBy: { activityDate: 'desc' }, take: 100 },
      memberTags: { include: { tag: true } },
    },
  });
  if (!user) throw new HttpError(404, 'User not found');

  // Relationships in both directions, flattened and de-duplicated by person.
  const familyMembers = [
    ...user.familyRelationships.map((rel) => ({ ...rel.relatedUser, relationshipType: rel.relationshipType, isPrimary: true })),
    ...user.relatedFamilyMembers.map((rel) => ({ ...rel.primaryUser, relationshipType: rel.relationshipType, isPrimary: false })),
  ];
  const uniqueFamilyMembers = familyMembers.filter((member, index) => index === familyMembers.findIndex((m) => m.id === member.id));

  return { ...user, familyMembers: uniqueFamilyMembers };
}

export function listTimeline(userId: string, query: z.output<typeof timelineQuery>) {
  return prisma.timelineActivity.findMany({
    where: { userId },
    orderBy: { activityDate: 'desc' },
    take: query.limit,
    skip: query.offset,
  });
}

export function listInteractions(userId: string, query: z.output<typeof interactionsQuery>) {
  return prisma.memberInteraction.findMany({
    where: { userId, category: query.category },
    orderBy: { createdAt: 'desc' },
    take: query.limit,
    skip: query.offset,
  });
}

export function listMilestones(userId: string, query: z.output<typeof milestonesQuery>) {
  return prisma.memberMilestone.findMany({
    where: { userId, category: query.category },
    orderBy: { achievedDate: 'desc' },
    take: query.limit,
    skip: query.offset,
  });
}

export function listNotes(userId: string, viewer: AuthenticatedUser, query: z.output<typeof notesQuery>) {
  return prisma.memberNote.findMany({
    where: { AND: [{ userId, noteType: query.noteType }, visibleNotes(viewer)] },
    orderBy: { createdAt: 'desc' },
    take: query.limit,
    skip: query.offset,
  });
}

export function addInteraction(userId: string, body: z.output<typeof addInteractionBody>) {
  return prisma.memberInteraction.create({
    data: { userId, ...body, status: 'completed', completedAt: new Date() },
  });
}

export function addMilestone(userId: string, body: z.output<typeof addMilestoneBody>) {
  return prisma.memberMilestone.create({ data: { userId, ...body } });
}

export function addNote(userId: string, authorId: string, body: z.output<typeof addNoteBody>) {
  return prisma.memberNote.create({ data: { userId, authorId, ...body } });
}
