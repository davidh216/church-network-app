/** Helpers for the add/edit member form (components/members/AddEditMemberModal). */
import type { Member } from '@/types/domain';

/** The form's fields, for placing API validation details inline. */
export const MEMBER_FORM_FIELDS = [
  'name',
  'email',
  'password',
  'phone',
  'bio',
  'volunteerSkills',
  'interests',
  'isActive',
  'roleIds',
] as const;

export interface ProfileLists {
  volunteerSkills: string[];
  interests: string[];
}

/** The member's stored skills and interests, or empty lists for a new member. */
export function profileLists(member?: Pick<Member, 'volunteerSkills' | 'interests'> | null) {
  return { volunteerSkills: member?.volunteerSkills ?? [], interests: member?.interests ?? [] };
}

/**
 * The edited lists that differ from the member's stored ones. Unchanged lists are left out, so
 * saving a member whose row did not carry the lists never clears them.
 */
export function changedLists(
  member: Pick<Member, 'volunteerSkills' | 'interests'>,
  lists: ProfileLists,
): Partial<ProfileLists> {
  const stored = profileLists(member);
  const changed: Partial<ProfileLists> = {};
  for (const key of ['volunteerSkills', 'interests'] as const) {
    if (JSON.stringify(stored[key]) !== JSON.stringify(lists[key])) changed[key] = lists[key];
  }
  return changed;
}
