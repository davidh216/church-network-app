import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import {
  GROUP_MEMBER_EXISTS,
  GROUP_MEMBER_INACTIVE,
  type addGroupMemberInput,
  type createGroupInput,
  type GroupLeader,
  type GroupRosterEntry,
  type GroupSummary,
  type listGroupsQuery,
  type MemberGroupMembership,
  type OwnGroupMembership,
  type StaffGroupDetail,
  type StaffGroupSummary,
  type updateGroupInput,
  type updateGroupMemberInput,
} from '@embrace/shared';
import { audit, type AuditActor } from '../../lib/audit';
import { HttpError } from '../../lib/http-error';
import { prisma } from '../../lib/prisma';

// Groups and ministries (PHASE5_SPECS.md G3). Members see active groups with their public fields
// and leader names only; staff also see archived groups, member counts and rosters. Every staff
// write is audited in its own transaction, with the group's name in `metadata.name`.

const GROUP_NOT_FOUND = 'Group not found';
const MEMBERSHIP_NOT_FOUND = 'This member is not in the group';

type Changes = Record<
  string,
  { from: Prisma.InputJsonValue | null; to: Prisma.InputJsonValue | null }
>;

// Active leader and co-leader rows of active users: the names the directory shows.
const leaderSelect = {
  where: { role: { in: ['leader', 'co_leader'] }, isActive: true, user: { isActive: true } },
  orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }, { id: 'asc' }],
  select: { role: true, user: { select: { name: true } } },
} satisfies Prisma.Group$membersArgs;

const publicSelect = {
  id: true,
  name: true,
  type: true,
  description: true,
  meetingDay: true,
  meetingTime: true,
  location: true,
  members: leaderSelect,
} satisfies Prisma.GroupSelect;

const staffSelect = {
  ...publicSelect,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { members: { where: { isActive: true, user: { isActive: true } } } } },
} satisfies Prisma.GroupSelect;

type PublicRow = Prisma.GroupGetPayload<{ select: typeof publicSelect }>;
type StaffRow = Prisma.GroupGetPayload<{ select: typeof staffSelect }>;

const toLeaders = (rows: PublicRow['members']): GroupLeader[] =>
  rows.map((m) => ({ name: m.user.name, role: m.role as GroupLeader['role'] }));

function toPublic(row: PublicRow): GroupSummary {
  const { id, name, type, description, meetingDay, meetingTime, location, members } = row;
  return {
    id,
    name,
    type,
    description,
    meetingDay,
    meetingTime,
    location,
    leaders: toLeaders(members),
  };
}

function toStaff(row: StaffRow): StaffGroupSummary {
  return {
    ...toPublic(row),
    isActive: row.isActive,
    memberCount: row._count.members,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const rosterSelect = {
  role: true,
  joinDate: true,
  isActive: true,
  user: { select: { id: true, name: true, isActive: true } },
} satisfies Prisma.GroupMemberSelect;

type RosterRow = Prisma.GroupMemberGetPayload<{ select: typeof rosterSelect }>;

const toRosterEntry = (row: RosterRow): GroupRosterEntry => ({
  userId: row.user.id,
  name: row.user.name,
  role: row.role,
  joinDate: row.joinDate.toISOString(),
  isActive: row.isActive,
  userIsActive: row.user.isActive,
});

const byName = [{ name: 'asc' }, { id: 'asc' }] satisfies Prisma.GroupOrderByWithRelationInput[];

// The directory by name. Members: active groups only; staff: `status` picks active (default),
// archived or all.
export async function listGroups(
  staff: boolean,
  query: z.output<typeof listGroupsQuery>,
): Promise<GroupSummary[] | StaffGroupSummary[]> {
  if (!staff) {
    const rows = await prisma.group.findMany({
      where: { isActive: true, type: query.type },
      orderBy: byName,
      select: publicSelect,
    });
    return rows.map(toPublic);
  }
  const status = query.status ?? 'active';
  const rows = await prisma.group.findMany({
    where: { type: query.type, ...(status === 'all' ? {} : { isActive: status === 'active' }) },
    orderBy: byName,
    select: staffSelect,
  });
  return rows.map(toStaff);
}

// The caller's own active memberships; members only see those in active groups.
export async function ownMemberships(
  userId: string,
  staff: boolean,
  query: z.output<typeof listGroupsQuery>,
): Promise<OwnGroupMembership[]> {
  const rows = await prisma.groupMember.findMany({
    where: {
      userId,
      isActive: true,
      group: { type: query.type, ...(staff ? {} : { isActive: true }) },
    },
    orderBy: [{ group: { name: 'asc' } }, { id: 'asc' }],
    select: { role: true, joinDate: true, group: { select: publicSelect } },
  });
  return rows.map((r) => ({
    group: toPublic(r.group),
    role: r.role,
    joinDate: r.joinDate.toISOString(),
  }));
}

/** A member's memberships for the staff profile (archived groups and inactive rows included). */
export async function memberGroups(userId: string): Promise<MemberGroupMembership[]> {
  const rows = await prisma.groupMember.findMany({
    where: { userId },
    orderBy: [{ group: { name: 'asc' } }, { id: 'asc' }],
    select: {
      role: true,
      joinDate: true,
      isActive: true,
      group: { select: { id: true, name: true, type: true, isActive: true } },
    },
  });
  return rows.map((r) => ({ ...r, joinDate: r.joinDate.toISOString() }));
}

// One group. A member asking for an archived (or missing) group gets 404, never 403.
export async function getGroup(
  id: string,
  staff: boolean,
): Promise<GroupSummary | StaffGroupDetail> {
  if (!staff) {
    const row = await prisma.group.findFirst({
      where: { id, isActive: true },
      select: publicSelect,
    });
    if (!row) throw new HttpError(404, GROUP_NOT_FOUND);
    return toPublic(row);
  }
  const [row, roster] = await prisma.$transaction([
    prisma.group.findUnique({ where: { id }, select: staffSelect }),
    prisma.groupMember.findMany({
      where: { groupId: id },
      orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }, { id: 'asc' }],
      select: rosterSelect,
    }),
  ]);
  if (!row) throw new HttpError(404, GROUP_NOT_FOUND);
  return { ...toStaff(row), roster: roster.map(toRosterEntry) };
}

export function createGroup(
  actor: AuditActor,
  body: z.output<typeof createGroupInput>,
): Promise<StaffGroupSummary> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.group.create({ data: body, select: staffSelect });
    await audit(
      tx,
      actor,
      'group_created',
      { type: 'group', id: row.id },
      {
        metadata: { name: row.name, type: row.type },
      },
    );
    return toStaff(row);
  });
}

const EDITABLE = [
  'name',
  'type',
  'description',
  'meetingDay',
  'meetingTime',
  'location',
  'isActive',
] as const;

// Archiving (isActive false) is recorded as group_archived; any other change, restoring an
// archived group included, as group_updated, with the changed fields' old and new values.
export function updateGroup(
  actor: AuditActor,
  id: string,
  body: z.output<typeof updateGroupInput>,
): Promise<StaffGroupSummary> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.group.findUnique({ where: { id }, select: staffSelect });
    if (!before) throw new HttpError(404, GROUP_NOT_FOUND);
    const changes: Changes = {};
    for (const key of EDITABLE) {
      const value = body[key];
      if (value !== undefined && value !== before[key])
        changes[key] = { from: before[key], to: value };
    }
    if (Object.keys(changes).length === 0) return toStaff(before);
    const row = await tx.group.update({ where: { id }, data: body, select: staffSelect });
    const archived = changes.isActive !== undefined && body.isActive === false;
    await audit(
      tx,
      actor,
      archived ? 'group_archived' : 'group_updated',
      { type: 'group', id },
      {
        metadata: { name: row.name, changes },
      },
    );
    return toStaff(row);
  });
}

// Deleting a group deletes its roster (cascade); the event counts the memberships removed.
export function deleteGroup(actor: AuditActor, id: string): Promise<{ removed: number }> {
  return prisma.$transaction(async (tx) => {
    const group = await tx.group.findUnique({
      where: { id },
      select: { name: true, _count: { select: { members: true } } },
    });
    if (!group) throw new HttpError(404, GROUP_NOT_FOUND);
    await tx.group.delete({ where: { id } });
    const removed = group._count.members;
    await audit(
      tx,
      actor,
      'group_deleted',
      { type: 'group', id },
      {
        count: removed,
        metadata: { name: group.name },
      },
    );
    return { removed };
  });
}

async function findGroup(tx: Prisma.TransactionClient, id: string) {
  const group = await tx.group.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!group) throw new HttpError(404, GROUP_NOT_FOUND);
  return group;
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

// Adds an active user to the roster. A row that already exists (active or not) is a 409.
export async function addMember(
  actor: AuditActor,
  groupId: string,
  body: z.output<typeof addGroupMemberInput>,
): Promise<GroupRosterEntry> {
  try {
    return await prisma.$transaction(async (tx) => {
      const group = await findGroup(tx, groupId);
      const user = await tx.user.findUnique({
        where: { id: body.userId },
        select: { id: true, name: true, isActive: true },
      });
      if (!user) throw new HttpError(404, 'User not found');
      if (!user.isActive) throw new HttpError(400, GROUP_MEMBER_INACTIVE, 'USER_INACTIVE');
      const existing = await tx.groupMember.findUnique({
        where: { userId_groupId: { userId: user.id, groupId } },
        select: { id: true },
      });
      if (existing) throw new HttpError(409, GROUP_MEMBER_EXISTS, 'CONFLICT');
      const row = await tx.groupMember.create({
        data: { groupId, userId: user.id, role: body.role },
        select: rosterSelect,
      });
      await audit(
        tx,
        actor,
        'group_member_added',
        { type: 'group', id: groupId },
        {
          metadata: { name: group.name, memberId: user.id, memberName: user.name, role: body.role },
        },
      );
      return toRosterEntry(row);
    });
  } catch (err) {
    // Two concurrent adds of the same member: the unique index refuses the second.
    if (isUniqueViolation(err)) throw new HttpError(409, GROUP_MEMBER_EXISTS, 'CONFLICT');
    throw err;
  }
}

async function findMembership(tx: Prisma.TransactionClient, groupId: string, userId: string) {
  const row = await tx.groupMember.findUnique({
    where: { userId_groupId: { userId, groupId } },
    select: { id: true, ...rosterSelect },
  });
  if (!row) throw new HttpError(404, MEMBERSHIP_NOT_FOUND);
  return row;
}

export function updateMember(
  actor: AuditActor,
  groupId: string,
  userId: string,
  body: z.output<typeof updateGroupMemberInput>,
): Promise<GroupRosterEntry> {
  return prisma.$transaction(async (tx) => {
    const group = await findGroup(tx, groupId);
    const before = await findMembership(tx, groupId, userId);
    const changes: Changes = {};
    for (const key of ['role', 'isActive'] as const) {
      const value = body[key];
      if (value !== undefined && value !== before[key])
        changes[key] = { from: before[key], to: value };
    }
    if (Object.keys(changes).length === 0) return toRosterEntry(before);
    const row = await tx.groupMember.update({
      where: { id: before.id },
      data: body,
      select: rosterSelect,
    });
    await audit(
      tx,
      actor,
      'group_member_updated',
      { type: 'group', id: groupId },
      {
        metadata: { name: group.name, memberId: userId, memberName: row.user.name, changes },
      },
    );
    return toRosterEntry(row);
  });
}

// Deletes the row; the audit log keeps the history.
export function removeMember(actor: AuditActor, groupId: string, userId: string): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const group = await findGroup(tx, groupId);
    const row = await findMembership(tx, groupId, userId);
    await tx.groupMember.delete({ where: { id: row.id } });
    await audit(
      tx,
      actor,
      'group_member_removed',
      { type: 'group', id: groupId },
      {
        metadata: { name: group.name, memberId: userId, memberName: row.user.name, role: row.role },
      },
    );
  });
}
