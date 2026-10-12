import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type {
  addInteractionInput,
  addMilestoneInput,
  addNoteInput,
  TimelineItem,
  timelineQuery,
} from '@embrace/shared';
import { prisma } from '../../lib/prisma';
import { HttpError } from '../../lib/http-error';
import { isAdmin } from '../../middleware/auth';
import type { AuthenticatedUser } from '../../types/auth';
import type { interactionsQuery, milestonesQuery, notesQuery } from './schemas';
import { today } from '../services/service';
import { memberGroups } from '../groups/service';
import { relationOfOther } from '../families/pairs';

// Private notes are visible only to their author and to admins.
function visibleNotes(viewer: AuthenticatedUser): Prisma.MemberNoteWhereInput {
  return isAdmin(viewer) ? {} : { OR: [{ isPrivate: false }, { authorId: viewer.id }] };
}

const relative = {
  select: {
    id: true,
    name: true,
    firstName: true,
    lastName: true,
    avatar: true,
    isActive: true,
    familyId: true,
  },
};
// The member's family on the staff profile: its name, head and address.
const familySelect = {
  id: true,
  familyName: true,
  headOfFamilyId: true,
  address: true,
  city: true,
  state: true,
  zipCode: true,
  country: true,
} satisfies Prisma.FamilySelect;
const person = { select: { id: true, name: true } };

// The pair helpers moved to the families module (G4); re-exported for existing callers.
export {
  inverseRelationship,
  normaliseFamilyPair,
  setFamilyRelationship,
  type FamilyPair,
} from '../families/pairs';

// The full CRM profile of a member: roles, engagement, family, recent interactions,
// milestones, notes the viewer may see, tags and group memberships (the timeline has its own
// paged endpoint). Never the password hash.
export async function getMemberDetails(id: string, viewer: AuthenticatedUser) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      roles: { include: { role: true } },
      engagement: true,
      family: { select: familySelect },
      familyRelationships: { where: { isActive: true }, include: { relatedUser: relative } },
      relatedFamilyMembers: { where: { isActive: true }, include: { primaryUser: relative } },
      interactions: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { staffMember: person },
      },
      milestones: { orderBy: { achievedDate: 'desc' }, take: 20 },
      memberNotes: {
        where: visibleNotes(viewer),
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { author: person },
      },
      // Staff only (P5-D12); archived tags stay listed with isActive false.
      memberTags: {
        orderBy: [{ tag: { name: 'asc' } }, { id: 'asc' }],
        include: { tag: true, addedBy: person },
      },
    },
  });
  if (!user) throw new HttpError(404, 'User not found');

  // lastAttended is the date of the latest service the member was marked present at, never one
  // dated after today (UTC). The legacy users.lastAttended column is not written by anything, so
  // the response field keeps its name and type but no longer reads the column.
  const latestAttended = await prisma.attendance.findFirst({
    where: { userId: id, present: true, service: { date: { lte: today() } } },
    orderBy: [{ service: { date: 'desc' } }, { id: 'asc' }],
    select: { service: { select: { date: true } } },
  });
  const lastAttended = latestAttended?.service.date ?? null;

  // Active relationships within the member's current family (PHASE5_SPECS.md 1.4), in both
  // directions, flattened and de-duplicated by person: a relationship kept from a family the
  // member left, or naming someone outside it, is not shown. Each entry's relationshipType is the
  // relative's relation to this member.
  const inFamily = (rel: { familyId: string }, other: { familyId: string | null }) =>
    user.familyId !== null && rel.familyId === user.familyId && other.familyId === user.familyId;
  const familyMembers = [
    ...user.familyRelationships
      .filter((rel) => inFamily(rel, rel.relatedUser))
      .map(({ relatedUser: { familyId: _f, ...other }, ...rel }) => ({
        ...other,
        relationshipType: relationOfOther(rel, user.id),
        isPrimary: true,
      })),
    ...user.relatedFamilyMembers
      .filter((rel) => inFamily(rel, rel.primaryUser))
      .map(({ primaryUser: { familyId: _f, ...other }, ...rel }) => ({
        ...other,
        relationshipType: relationOfOther(rel, user.id),
        isPrimary: false,
      })),
  ];
  const uniqueFamilyMembers = familyMembers.filter(
    (member, index) => index === familyMembers.findIndex((m) => m.id === member.id),
  );

  // Head of family is derived from the family row (users.isHeadOfFamily was dropped in P3-D3).
  const isHeadOfFamily = user.family?.headOfFamilyId === user.id;

  // Staff only, like the whole profile: every membership, archived groups and inactive rows too.
  const groupMemberships = await memberGroups(id);

  // The raw relationship rows stay out of the response: familyMembers is their filtered view.
  const { familyRelationships: _own, relatedFamilyMembers: _related, ...profile } = user;
  return {
    ...profile,
    lastAttended,
    isHeadOfFamily,
    familyMembers: uniqueFamilyMembers,
    groupMemberships,
  };
}

// "call_made" -> "Call made"
function humanise(value: string): string {
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const SUMMARY_MAX = 280;
function summarise(text: string | null | undefined): string | null {
  if (!text) return null;
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text;
}

interface FeedItem extends Omit<TimelineItem, 'date'> {
  date: Date;
}

// A calendar date stored as a timestamp sits at UTC midnight.
function isUtcMidnight(date: Date): boolean {
  return date.getTime() % 86_400_000 === 0;
}

// Newest first; ties broken by kind then id so pages are stable.
function byDateDesc(a: FeedItem, b: FeedItem): number {
  return (
    b.date.getTime() - a.date.getTime() ||
    a.kind.localeCompare(b.kind) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

// The member timeline, computed on read (decision D6): interactions (by createdAt), milestones
// (by achievedDate), the notes the viewer may see (by createdAt) and attended services (by
// Service.date), merged newest first. Each source contributes at most the rows that can land on
// the requested page, so a page costs four indexed queries of `page * pageSize` rows at most.
export async function listTimeline(
  userId: string,
  viewer: AuthenticatedUser,
  query: z.output<typeof timelineQuery>,
): Promise<{ items: TimelineItem[]; total: number }> {
  const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) throw new HttpError(404, 'User not found');

  const take = query.page * query.pageSize;
  const noteWhere: Prisma.MemberNoteWhereInput = { AND: [{ userId }, visibleNotes(viewer)] };
  const attendanceWhere: Prisma.AttendanceWhereInput = { userId, present: true };

  const [interactions, milestones, notes, attendance, counts] = await Promise.all([
    prisma.memberInteraction.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take,
      select: {
        id: true,
        createdAt: true,
        subject: true,
        content: true,
        interactionType: true,
      },
    }),
    prisma.memberMilestone.findMany({
      where: { userId },
      orderBy: [{ achievedDate: 'desc' }, { id: 'asc' }],
      take,
      select: { id: true, achievedDate: true, title: true, description: true },
    }),
    prisma.memberNote.findMany({
      where: noteWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take,
      select: { id: true, createdAt: true, title: true, content: true, noteType: true },
    }),
    prisma.attendance.findMany({
      where: attendanceWhere,
      orderBy: [{ service: { date: 'desc' } }, { id: 'asc' }],
      take,
      select: {
        id: true,
        notes: true,
        service: { select: { date: true, type: true, title: true } },
      },
    }),
    Promise.all([
      prisma.memberInteraction.count({ where: { userId } }),
      prisma.memberMilestone.count({ where: { userId } }),
      prisma.memberNote.count({ where: noteWhere }),
      prisma.attendance.count({ where: attendanceWhere }),
    ]),
  ]);

  const feed: FeedItem[] = [
    ...interactions.map((i) => ({
      kind: 'interaction' as const,
      id: i.id,
      date: i.createdAt,
      dateOnly: false,
      title: i.subject || humanise(i.interactionType),
      summary: summarise(i.content),
    })),
    ...milestones.map((m) => ({
      kind: 'milestone' as const,
      id: m.id,
      date: m.achievedDate,
      dateOnly: isUtcMidnight(m.achievedDate),
      title: m.title,
      summary: summarise(m.description),
    })),
    ...notes.map((n) => ({
      kind: 'note' as const,
      id: n.id,
      date: n.createdAt,
      dateOnly: false,
      title: n.title || humanise(n.noteType),
      summary: summarise(n.content),
    })),
    ...attendance.map((a) => ({
      kind: 'attendance' as const,
      id: a.id,
      date: a.service.date,
      dateOnly: true,
      title: `Attended ${a.service.title || humanise(a.service.type).toLowerCase()}`,
      summary: summarise(a.notes),
    })),
  ];

  const start = (query.page - 1) * query.pageSize;
  const items = feed
    .sort(byDateDesc)
    .slice(start, start + query.pageSize)
    .map((item) => ({ ...item, date: item.date.toISOString() }));
  return { items, total: counts.reduce((sum, n) => sum + n, 0) };
}

export function listInteractions(userId: string, query: z.output<typeof interactionsQuery>) {
  return prisma.memberInteraction.findMany({
    where: { userId, category: query.category },
    orderBy: { createdAt: 'desc' },
    take: query.limit,
    skip: query.offset,
    include: { staffMember: person },
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

export function listNotes(
  userId: string,
  viewer: AuthenticatedUser,
  query: z.output<typeof notesQuery>,
) {
  return prisma.memberNote.findMany({
    where: { AND: [{ userId, noteType: query.noteType }, visibleNotes(viewer)] },
    orderBy: { createdAt: 'desc' },
    take: query.limit,
    skip: query.offset,
    include: { author: person },
  });
}

// The staff member recording the interaction is kept as its staffMember.
export function addInteraction(
  userId: string,
  staffMemberId: string,
  body: z.output<typeof addInteractionInput>,
) {
  return prisma.memberInteraction.create({
    data: { userId, staffMemberId, ...body, status: 'completed', completedAt: new Date() },
    include: { staffMember: person },
  });
}

export function addMilestone(userId: string, body: z.output<typeof addMilestoneInput>) {
  return prisma.memberMilestone.create({ data: { userId, ...body } });
}

export function addNote(userId: string, authorId: string, body: z.output<typeof addNoteInput>) {
  return prisma.memberNote.create({
    data: { userId, authorId, ...body },
    include: { author: person },
  });
}
