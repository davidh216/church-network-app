import { describe, expect, it } from 'vitest';
import { actionLabel, describeDetails, targetHref, targetLink, targetText } from './display';

describe('audit display helpers', () => {
  it('labels actions as sentences', () => {
    expect(actionLabel('user_role_changed')).toBe('User role changed');
    expect(actionLabel('tag_assigned')).toBe('Tag assigned');
  });

  it('links users, groups and families, and nothing else', () => {
    expect(targetHref('user', 'u1')).toBe('/members/u1');
    expect(targetHref('group', 'g/1')).toBe('/groups/g%2F1');
    expect(targetHref('family', 'f1')).toBe('/families/f1');
    expect(targetHref('tag', 't1')).toBeNull();
    expect(targetHref('user', null)).toBeNull();
  });

  it('links only a target that still exists', () => {
    expect(targetLink({ targetType: 'group', targetId: 'g1', targetExists: true })).toBe(
      '/groups/g1',
    );
    expect(targetLink({ targetType: 'group', targetId: 'g1', targetExists: false })).toBeNull();
    expect(targetLink({ targetType: 'family', targetId: 'f1', targetExists: false })).toBeNull();
  });

  it('marks a deleted target, and names one without a recorded name by its type', () => {
    const user = { targetType: 'user', targetId: 'u1' };
    expect(targetText({ ...user, targetName: 'Ann', targetExists: true })).toBe('Ann');
    expect(targetText({ ...user, targetName: 'Ann', targetExists: false })).toBe('Ann (deleted)');
    expect(
      targetText({ targetType: 'tag', targetId: 't1', targetName: null, targetExists: false }),
    ).toBe('Deleted tag');
  });

  it('summarises from/to changes, other fields and the count', () => {
    expect(
      describeDetails({ metadata: { from: ['member'], to: ['leader', 'member'] }, count: null }),
    ).toBe('member → leader, member');
    expect(
      describeDetails({
        metadata: { name: 'Choir', tagName: 'Choir', tagId: 't1' },
        count: 3,
      }),
    ).toBe('tag: Choir; count: 3');
    expect(describeDetails({ metadata: null, count: null })).toBe('');
  });

  it('shows changes as "field: old → new" and hides raw ids', () => {
    expect(
      describeDetails({
        metadata: {
          name: 'Youth',
          changes: { name: { from: 'Yuoth', to: 'Youth' }, isActive: { from: true, to: false } },
        },
        count: null,
      }),
    ).toBe('name: Yuoth → Youth; active: true → false');
    expect(
      describeDetails({
        metadata: {
          name: 'Smith',
          changes: { headOfFamilyId: { from: null, to: 'u2' }, city: { from: 'Leeds', to: null } },
        },
        count: null,
      }),
    ).toBe('head of family: set; city: Leeds → none');
    expect(
      describeDetails({
        metadata: {
          name: 'Youth',
          memberId: 'u1',
          memberName: 'Mo',
          changes: { role: { from: 'member', to: 'co_leader' } },
        },
        count: null,
      }),
    ).toBe('member: Mo; role: member → co_leader');
  });

  it('names references and relationships without their ids', () => {
    expect(
      describeDetails({
        metadata: {
          name: 'Ng',
          memberId: 'u1',
          memberName: 'Mo',
          relationships: 1,
          wasHead: false,
          movedTo: { id: 'f2', name: 'Lee' },
        },
        count: 1,
      }),
    ).toBe('member: Mo; relationships: 1; was head: false; moved to: Lee; count: 1');
    expect(
      describeDetails({
        metadata: {
          name: 'Ng',
          relationshipId: 'r1',
          userId: 'u1',
          userName: 'Al',
          relatedUserId: 'u2',
          relatedUserName: 'Bo',
          type: 'parent',
          previousType: null,
        },
        count: null,
      }),
    ).toBe('user: Al; related user: Bo; type: parent; previous type: none');
  });
});
