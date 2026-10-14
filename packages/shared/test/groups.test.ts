import { describe, expect, it } from 'vitest';
import {
  addGroupMemberInput,
  createGroupInput,
  isStaffGroup,
  listGroupsQuery,
  updateGroupInput,
  updateGroupMemberInput,
} from '../src';

describe('group schemas', () => {
  it('trims the fields and stores blank optional ones as null', () => {
    expect(
      createGroupInput.parse({
        name: ' Choir ',
        type: 'ministry',
        description: ' ',
        meetingDay: 'Wednesdays',
        location: ' Hall ',
      }),
    ).toEqual({
      name: 'Choir',
      type: 'ministry',
      description: null,
      meetingDay: 'Wednesdays',
      location: 'Hall',
    });
  });

  it('bounds the name to 1-100 characters and the meeting day to 60', () => {
    const base = { type: 'ministry' };
    expect(createGroupInput.safeParse({ ...base, name: 'x'.repeat(100) }).success).toBe(true);
    expect(createGroupInput.safeParse({ ...base, name: 'x'.repeat(101) }).success).toBe(false);
    expect(createGroupInput.safeParse({ ...base, name: ' ' }).success).toBe(false);
    expect(createGroupInput.safeParse({ name: 'A' }).success).toBe(false);
    expect(
      createGroupInput.safeParse({ ...base, name: 'A', meetingDay: 'x'.repeat(61) }).success,
    ).toBe(false);
    expect(
      createGroupInput.safeParse({ ...base, name: 'A', location: 'x'.repeat(201) }).success,
    ).toBe(false);
  });

  it('takes any subset on update, archiving with isActive', () => {
    expect(updateGroupInput.parse({ isActive: false })).toEqual({ isActive: false });
    expect(updateGroupInput.parse({ location: '' })).toEqual({ location: null });
    expect(updateGroupInput.safeParse({ type: 'club' }).success).toBe(false);
  });

  it('reads the list flags and filters', () => {
    expect(listGroupsQuery.parse({})).toEqual({ mine: false });
    expect(listGroupsQuery.parse({ mine: 'true', type: 'committee', status: 'all' })).toEqual({
      mine: true,
      type: 'committee',
      status: 'all',
    });
    expect(listGroupsQuery.safeParse({ mine: 'yes' }).success).toBe(false);
    expect(listGroupsQuery.safeParse({ status: 'archived' }).success).toBe(false);
  });

  it('defaults a new member to role member and needs a user id', () => {
    expect(addGroupMemberInput.parse({ userId: 'clh3am8hi0000qzrmn831i7rn' })).toEqual({
      userId: 'clh3am8hi0000qzrmn831i7rn',
      role: 'member',
    });
    expect(addGroupMemberInput.safeParse({ userId: 'nope' }).success).toBe(false);
    expect(updateGroupMemberInput.safeParse({ role: 'captain' }).success).toBe(false);
  });

  it('tells the staff shape from the member shape', () => {
    const group = {
      id: 'g',
      name: 'Choir',
      type: 'ministry' as const,
      description: null,
      meetingDay: null,
      meetingTime: null,
      location: null,
      leaders: [],
    };
    expect(isStaffGroup(group)).toBe(false);
    const staff = { ...group, isActive: true, memberCount: 0, createdAt: '', updatedAt: '' };
    expect(isStaffGroup(staff)).toBe(true);
  });
});
