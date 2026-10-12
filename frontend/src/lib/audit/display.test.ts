import { describe, expect, it } from 'vitest';
import { actionLabel, describeDetails, targetHref, targetText } from './display';

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

  it('names a deleted target by its type', () => {
    expect(targetText({ targetType: 'user', targetName: 'Ann' })).toBe('Ann');
    expect(targetText({ targetType: 'tag', targetName: null })).toBe('Deleted tag');
  });

  it('summarises from/to changes, other fields and the count', () => {
    expect(
      describeDetails({ metadata: { from: ['member'], to: ['leader', 'member'] }, count: null }),
    ).toBe('member → leader, member');
    expect(
      describeDetails({
        metadata: { name: 'Choir', tagName: 'Choir', changes: { color: 1 } },
        count: 3,
      }),
    ).toBe('tagName: Choir; changes: color; count: 3');
    expect(describeDetails({ metadata: null, count: null })).toBe('');
  });
});
