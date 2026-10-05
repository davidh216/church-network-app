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

// Private notes are visible only to their author and to admins.
function visibleNotes(viewer: AuthenticatedUser): Prisma.MemberNoteWhereInput {
  return isAdmin(viewer) ? {} : { OR: [{ isPrivate: false }, { authorId: viewer.id }] };
}

const relative = {
  select: { id: true, name: true, firstName: true, lastName: true, avatar: true, isActive: true },
};

// The full CRM profile of a member: roles, engagement, family, recent interactions,
// milestones, notes the viewer may see and tags (the timeline has its own paged endpoint). Never the password hash.
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
      memberTags: { include: { tag: true } },
    },
  });
  if (!user) throw new HttpError(404, 'User not found');

  // Relationships in both directions, flattened and de-duplicated by person.
  const familyMembers = [
    ...user.familyRelationships.map((rel) => ({
      ...rel.relatedUser,
      relationshipType: rel.relationshipType,
      isPrimary: true,
    })),
    ...user.relatedFamilyMembers.map((rel) => ({
      ...rel.primaryUser,
      relationshipType: rel.relationshipType,
      isPrimary: false,
    })),
  ];
  const uniqueFamilyMembers = familyMembers.filter(
    (member, index) => index === familyMembers.findIndex((m) => m.id === member.id),
  );

  return { ...user, familyMembers: uniqueFamilyMembers };
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
// service date), merged newest first. Each source contributes at most the rows that can land on
// the requested page, so a page costs four indexed queries of `page * pageSize` rows at most.
export async function listTimeline(
  userId: string,
  viewer: AuthenticatedUser,
  query: z.output<typeof timelineQuery>,
): Promise<{ items: TimelineItem[]; total: number }> {
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
      orderBy: [{ serviceDate: 'desc' }, { id: 'asc' }],
      take,
      select: { id: true, serviceDate: true, serviceType: true, notes: true },
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
      title: i.subject || humanise(i.interactionType),
      summary: summarise(i.content),
    })),
    ...milestones.map((m) => ({
      kind: 'milestone' as const,
      id: m.id,
      date: m.achievedDate,
      title: m.title,
      summary: summarise(m.description),
    })),
    ...notes.map((n) => ({
      kind: 'note' as const,
      id: n.id,
      date: n.createdAt,
      title: n.title || humanise(n.noteType),
      summary: summarise(n.content),
    })),
    ...attendance.map((a) => ({
      kind: 'attendance' as const,
      id: a.id,
      date: a.serviceDate,
      title: `Attended ${humanise(a.serviceType).toLowerCase()}`,
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
  });
}

export function addInteraction(userId: string, body: z.output<typeof addInteractionInput>) {
  return prisma.memberInteraction.create({
    data: { userId, ...body, status: 'completed', completedAt: new Date() },
  });
}

export function addMilestone(userId: string, body: z.output<typeof addMilestoneInput>) {
  return prisma.memberMilestone.create({ data: { userId, ...body } });
}

export function addNote(userId: string, authorId: string, body: z.output<typeof addNoteInput>) {
  return prisma.memberNote.create({ data: { userId, authorId, ...body } });
}
