import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  addMilestoneInput,
  addNoteInput,
  changePasswordInput,
  createMediaInput,
  createSavedSearchInput,
  createUserInput,
  listMediaQuery,
  listUsersQuery,
  loginInput,
  MAX_QUERY_TEXT,
  MAX_SEARCH_CONDITIONS,
  recordActivityInput,
  registerInput,
  resetPasswordInput,
  searchQuery,
  updateUserInput,
} from '../src';

// Every message a form can show inline is written for people (the API returns the same text).
const messages = (schema: z.ZodType, input: unknown) => {
  const result = schema.safeParse(input);
  if (result.success) throw new Error('expected a validation failure');
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('human validation messages', () => {
  it('account forms', () => {
    expect(messages(loginInput, {})).toEqual({
      email: 'Enter a valid email address',
      password: 'Enter your password',
    });
    expect(messages(loginInput, { email: 'nope', password: '' })).toEqual({
      email: 'Enter a valid email address',
      password: 'Enter your password',
    });
    expect(
      messages(registerInput, {
        email: 'ann@example.com',
        password: 'a long enough password',
        name: '  ',
        phone: 'x'.repeat(51),
      }),
    ).toEqual({ name: 'Name is required', phone: 'Phone must be at most 50 characters' });
    expect(
      messages(changePasswordInput, { currentPassword: '', newPassword: 'a long one!!!' }),
    ).toEqual({ currentPassword: 'Enter your current password' });
    expect(messages(resetPasswordInput, {})).toEqual({ newPassword: 'Enter a password' });
  });

  it('member forms', () => {
    expect(
      messages(createUserInput, {
        name: '',
        email: 'bad',
        password: 'a long enough password',
        bio: 'x'.repeat(2001),
        roleIds: ['not-a-cuid'],
      }),
    ).toEqual({
      name: 'Name is required',
      email: 'Enter a valid email address',
      bio: 'Bio must be at most 2000 characters',
      'roleIds.0': 'Must be a valid id',
    });
    expect(messages(updateUserInput, { name: ' ' })).toEqual({ name: 'Name is required' });
  });

  it('media form', () => {
    expect(messages(createMediaInput, { title: '', type: 'X', tags: [''] })).toEqual({
      title: 'Please enter a title',
      type: 'Only YouTube videos can be added',
      url: 'Enter a YouTube link',
      'tags.0': 'Tags cannot be blank',
    });
    expect(
      messages(createMediaInput, {
        title: 'x'.repeat(201),
        description: 'x'.repeat(5001),
        type: 'YOUTUBE_VIDEO',
        url: 'https://youtu.be/abcdefghijk',
        tags: Array<string>(21).fill('a'),
      }),
    ).toEqual({
      title: 'Title must be at most 200 characters',
      description: 'Description must be at most 5000 characters',
      tags: 'Add at most 20 tags',
    });
  });

  it('saved searches and the search query', () => {
    expect(
      messages(createSavedSearchInput, { name: '', query: { conditions: [], logic: 'X' } }),
    ).toEqual({
      name: 'Name is required',
      'query.conditions': 'Add at least one condition',
      'query.logic': 'Choose AND or OR',
    });
    expect(
      messages(searchQuery, {
        conditions: [
          { field: 'name', operator: 'contains', value: ' ' },
          { field: 'roles', operator: 'includes', value: '' },
          { field: 'engagement.engagementScore', operator: 'gte', value: 'x' },
          { field: 'engagement.riskLevel', operator: 'in', value: [] },
        ],
        logic: 'AND',
      }),
    ).toEqual({
      'conditions.0.value': 'Enter a value',
      'conditions.1.value': 'Choose a role',
      'conditions.2.value': 'Enter a number',
      'conditions.3.value': 'Choose at least one value',
    });
  });

  it('profile records', () => {
    expect(messages(addNoteInput, { content: '' })).toEqual({ content: 'Please enter the note' });
    expect(
      messages(addMilestoneInput, { milestoneType: '', title: '', achievedDate: 'x' }),
    ).toEqual({
      milestoneType: 'Milestone type is required',
      title: 'Please enter a title',
      achievedDate: 'Enter a valid date',
    });
    expect(messages(recordActivityInput, { activityType: 'x', points: 1.5 })).toEqual({
      points: 'Points must be a whole number from -1000 to 1000',
    });
  });
});

describe('search limits', () => {
  it('caps the conditions per query', () => {
    const condition = { field: 'isActive', operator: 'equals', value: true };
    expect(MAX_SEARCH_CONDITIONS).toBe(10);
    const at = (n: number) =>
      searchQuery.safeParse({ conditions: Array(n).fill(condition), logic: 'OR' });
    expect(at(MAX_SEARCH_CONDITIONS).success).toBe(true);
    expect(messages(searchQuery, { conditions: Array(11).fill(condition), logic: 'OR' })).toEqual({
      conditions: 'Use at most 10 conditions',
    });
  });

  it('caps search text at MAX_QUERY_TEXT in the list queries and condition values', () => {
    expect(MAX_QUERY_TEXT).toBe(200);
    const long = 'x'.repeat(MAX_QUERY_TEXT + 1);
    expect(listUsersQuery.safeParse({ q: long.slice(1) }).success).toBe(true);
    expect(messages(listUsersQuery, { q: long })).toEqual({
      q: 'Search must be at most 200 characters',
    });
    expect(messages(listMediaQuery, { search: long })).toEqual({
      search: 'Search must be at most 200 characters',
    });
    expect(
      messages(searchQuery, {
        conditions: [{ field: 'bio', operator: 'contains', value: long }],
        logic: 'AND',
      }),
    ).toEqual({ 'conditions.0.value': 'The value must be at most 200 characters' });
  });
});
