import {
  enumLabel,
  type GroupLeader,
  type GroupMemberRole,
  type GroupSummary,
} from '@embrace/shared';

const ROLE_LABELS: Record<GroupMemberRole, string> = {
  leader: 'Leader',
  co_leader: 'Co-leader',
  member: 'Member',
};

/** "co_leader" -> "Co-leader". */
export const groupRoleLabel = (role: GroupMemberRole): string => ROLE_LABELS[role];

/** "small_group" -> "Small Group". */
export const groupTypeLabel = (type: string): string => enumLabel(type);

/** "Wednesdays at 19:30", "Wednesdays", "19:30", or null when no schedule is set. */
export function scheduleText(
  group: Pick<GroupSummary, 'meetingDay' | 'meetingTime'>,
): string | null {
  const { meetingDay, meetingTime } = group;
  if (meetingDay && meetingTime) return `${meetingDay} at ${meetingTime}`;
  return meetingDay || meetingTime || null;
}

/** "Ann (Leader), Ben (Co-leader)", or null without leaders. */
export function leadersText(leaders: GroupLeader[]): string | null {
  if (leaders.length === 0) return null;
  return leaders.map((l) => `${l.name} (${groupRoleLabel(l.role)})`).join(', ');
}
