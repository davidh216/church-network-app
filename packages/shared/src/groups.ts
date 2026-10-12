import { z } from 'zod';
import { groupMemberRole, groupType, type GroupMemberRole, type GroupType } from './enums.js';
import { cuid, optionalText, requiredText } from './primitives.js';

// Groups and ministries (PHASE5_SPECS.md G3). Every signed-in user sees the directory of active
// groups; staff also see archived groups, member counts and rosters, and manage them. A group's
// leaders are its roster rows with role leader or co_leader (P5-D8).

export const MAX_GROUP_NAME = 100;
export const MAX_GROUP_DESCRIPTION = 2000;
export const MAX_MEETING_DAY = 60;
export const MAX_MEETING_TIME = 60;
export const MAX_GROUP_LOCATION = 200;
export const GROUP_MEMBER_EXISTS = 'This member is already in the group';
export const GROUP_MEMBER_INACTIVE = 'Only active members can be added to a group';

const groupName = requiredText('Name', MAX_GROUP_NAME);
const groupFields = {
  description: optionalText('Description', MAX_GROUP_DESCRIPTION),
  // Free text ("Wednesdays", "First Sunday of the month").
  meetingDay: optionalText('Meeting day', MAX_MEETING_DAY),
  meetingTime: optionalText('Meeting time', MAX_MEETING_TIME),
  location: optionalText('Location', MAX_GROUP_LOCATION),
};

// POST /api/groups (staff). Blank optional fields are stored as null.
export const createGroupInput = z.object({ name: groupName, type: groupType, ...groupFields });

// PATCH /api/groups/:id (staff): any subset; `isActive: false` archives, `true` restores.
export const updateGroupInput = z.object({
  name: groupName.optional(),
  type: groupType.optional(),
  ...groupFields,
  isActive: z.boolean({ error: 'Active must be true or false' }).optional(),
});

const booleanFlag = (name: string) =>
  z
    .enum(['true', 'false'], { error: `${name} must be true or false` })
    .optional()
    .transform((v) => v === 'true');

// Query string of GET /api/groups. `mine=true` returns the caller's own memberships instead of
// the directory. `status` is staff-only (members only ever see active groups).
export const listGroupsQuery = z.object({
  mine: booleanFlag('mine'),
  type: groupType.optional(),
  status: z
    .enum(['active', 'inactive', 'all'], { error: 'Choose active, inactive or all' })
    .optional(),
});

// POST /api/groups/:id/members (staff). Only active users; an existing row is a 409.
export const addGroupMemberInput = z.object({
  userId: cuid,
  role: groupMemberRole.default('member'),
});

// PATCH /api/groups/:id/members/:userId (staff).
export const updateGroupMemberInput = z.object({
  role: groupMemberRole.optional(),
  isActive: z.boolean({ error: 'Active must be true or false' }).optional(),
});

export type CreateGroupInput = z.input<typeof createGroupInput>;
export type UpdateGroupInput = z.input<typeof updateGroupInput>;
export type ListGroupsQuery = z.input<typeof listGroupsQuery>;
export type AddGroupMemberInput = z.input<typeof addGroupMemberInput>;
export type UpdateGroupMemberInput = z.input<typeof updateGroupMemberInput>;

/** A leader as the directory names them: active leader and co-leader rows of active users. */
export interface GroupLeader {
  name: string;
  role: Exclude<GroupMemberRole, 'member'>;
}

/** A group as every signed-in user sees it (active groups only for members). */
export interface GroupSummary {
  id: string;
  name: string;
  type: GroupType;
  description: string | null;
  meetingDay: string | null;
  meetingTime: string | null;
  location: string | null;
  /** Leaders first, then co-leaders, each by name. */
  leaders: GroupLeader[];
}

/** A group as staff see it in the directory. */
export interface StaffGroupSummary extends GroupSummary {
  /** False once archived. */
  isActive: boolean;
  /** Active memberships of active users. */
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

/** One roster row (staff only). */
export interface GroupRosterEntry {
  userId: string;
  name: string;
  role: GroupMemberRole;
  joinDate: string;
  /** The membership's own flag. */
  isActive: boolean;
  /** False when the member's account is deactivated. */
  userIsActive: boolean;
}

/** GET /api/groups/:id for staff: the summary and the roster (leaders first, then by name). */
export interface StaffGroupDetail extends StaffGroupSummary {
  roster: GroupRosterEntry[];
}

/** One of the caller's own memberships (GET /api/groups?mine=true). */
export interface OwnGroupMembership {
  group: GroupSummary;
  role: GroupMemberRole;
  joinDate: string;
}

/** A member's group memberships as the staff profile shows them (member-details). */
export interface MemberGroupMembership {
  group: { id: string; name: string; type: GroupType; isActive: boolean };
  role: GroupMemberRole;
  joinDate: string;
  isActive: boolean;
}

/** True for the staff shape of a group (the API decides which one a caller gets). */
export const isStaffGroup = (group: GroupSummary): group is StaffGroupSummary =>
  'memberCount' in group;
