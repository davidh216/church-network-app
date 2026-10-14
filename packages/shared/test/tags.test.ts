import { describe, expect, it } from 'vitest';
import {
  assignTagInput,
  createTagInput,
  listTagsQuery,
  TAG_COLOR_MESSAGE,
  updateTagInput,
} from '../src';

describe('tag schemas', () => {
  it('trims the name and defaults the colour and category', () => {
    expect(createTagInput.parse({ name: ' Choir ' })).toEqual({
      name: 'Choir',
      color: '#3B82F6',
      category: 'general',
    });
  });

  it('takes names of 1 to 40 characters and #RRGGBB colours only', () => {
    expect(createTagInput.safeParse({ name: 'x'.repeat(40) }).success).toBe(true);
    expect(createTagInput.safeParse({ name: 'x'.repeat(41) }).success).toBe(false);
    expect(createTagInput.safeParse({ name: ' ' }).success).toBe(false);
    for (const color of ['#abc', 'red', '#12345G', '#1234567', ' #123456'])
      expect(createTagInput.safeParse({ name: 'A', color }).error?.issues[0]?.message).toBe(
        TAG_COLOR_MESSAGE,
      );
    expect(updateTagInput.parse({ color: '#a1B2c3', isActive: false })).toEqual({
      color: '#a1B2c3',
      isActive: false,
    });
    expect(updateTagInput.safeParse({ category: 'pastoral' }).success).toBe(false);
  });

  it('reads includeArchived as a boolean and needs a tag id to assign', () => {
    expect(listTagsQuery.parse({})).toEqual({ includeArchived: false });
    expect(listTagsQuery.parse({ includeArchived: 'true' })).toEqual({ includeArchived: true });
    expect(listTagsQuery.safeParse({ includeArchived: '1' }).success).toBe(false);
    expect(assignTagInput.safeParse({ tagId: 'nope' }).success).toBe(false);
  });
});
