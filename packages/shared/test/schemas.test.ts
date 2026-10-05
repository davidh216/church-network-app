import { describe, expect, it } from 'vitest';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_MATCHES_EMAIL,
  changePasswordInput,
  createMediaInput,
  createSavedSearchInput,
  canonicalYouTubeUrl,
  DEFAULT_MEDIA_PAGE_SIZE,
  listMediaQuery,
  youtubeVideoId,
  createUserInput,
  isCommonPassword,
  loginInput,
  membershipStage,
  optionalQueryText,
  passwordSchema,
  registerInput,
  updateUserInput,
} from '../src';

const GOOD_PASSWORD = 'correct-horse-battery';

describe('password policy', () => {
  it('uses the documented length limits', () => {
    expect([MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH]).toEqual([12, 128]);
    expect(passwordSchema.safeParse('a'.repeat(11) + '!').success).toBe(true);
    expect(passwordSchema.safeParse('x'.repeat(11)).success).toBe(false);
    expect(passwordSchema.safeParse('x'.repeat(129)).success).toBe(false);
  });

  it('rejects common passwords case-insensitively', () => {
    expect(isCommonPassword('QWEASDQWEASD')).toBe(true);
    expect(passwordSchema.safeParse('Qweasdqweasd').success).toBe(false);
  });

  it('rejects a password equal to the email local part on register and staff create', () => {
    const body = { email: 'longusername@example.org', password: 'LongUserName', name: 'X' };
    const result = registerInput.safeParse(body);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ['password'],
      message: PASSWORD_MATCHES_EMAIL,
    });
    expect(createUserInput.safeParse(body).success).toBe(false);
  });
});

describe('input schemas', () => {
  it('accepts valid auth bodies', () => {
    expect(
      registerInput.safeParse({ email: 'a@b.org', password: GOOD_PASSWORD, name: 'A' }),
    ).toMatchObject({ success: true });
    expect(loginInput.safeParse({ email: 'a@b.org', password: 'x' }).success).toBe(true);
    expect(
      changePasswordInput.safeParse({ currentPassword: 'x', newPassword: GOOD_PASSWORD }).success,
    ).toBe(true);
  });

  it('turns blank optional text into null and trims names', () => {
    const parsed = updateUserInput.parse({ name: '  Ann  ', phone: '  ', bio: 'Hi' });
    expect(parsed).toEqual({ name: 'Ann', phone: null, bio: 'Hi' });
  });

  it('takes skills and interests as lists: trimmed, de-duplicated ignoring case, at most 30', () => {
    expect(
      updateUserInput.parse({ volunteerSkills: [' Music', 'MUSIC ', 'Art'], interests: [] }),
    ).toEqual({ volunteerSkills: ['Music', 'Art'], interests: [] });
    expect(updateUserInput.safeParse({ interests: '["Hiking"]' }).success).toBe(false);
    expect(updateUserInput.safeParse({ interests: [' '] }).success).toBe(false);
    expect(updateUserInput.safeParse({ interests: Array(31).fill('x') }).success).toBe(false);
  });

  it('only accepts cuid role ids, at most 10', () => {
    expect(updateUserInput.safeParse({ roleIds: ['not-a-cuid'] }).success).toBe(false);
    expect(
      updateUserInput.safeParse({ roleIds: Array(11).fill('cjld2cjxh0000qzrmn831i7rn') }).success,
    ).toBe(false);
  });

  it('accepts https YouTube URLs only', () => {
    const base = { title: 'Sermon', type: 'YOUTUBE_VIDEO' };
    expect(createMediaInput.parse({ ...base, url: 'https://youtu.be/dQw4w9WgXcQ' }).tags).toEqual(
      [],
    );
    expect(
      createMediaInput.safeParse({ ...base, url: 'http://youtu.be/dQw4w9WgXcQ' }).success,
    ).toBe(false);
    expect(createMediaInput.safeParse({ ...base, url: 'https://vimeo.com/1' }).success).toBe(false);
  });

  it('canonicalises YouTube watch and share URLs', () => {
    const base = { title: 'Sermon', type: 'YOUTUBE_VIDEO' };
    const canonical = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    for (const url of [
      'https://youtu.be/dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?si=abc&t=42',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL1',
      'https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ',
      '  https://YOUTU.BE/dQw4w9WgXcQ  ',
    ])
      expect(createMediaInput.parse({ ...base, url }).url, url).toBe(canonical);
  });

  it('rejects non-YouTube and malformed YouTube URLs', () => {
    const base = { title: 'Sermon', type: 'YOUTUBE_VIDEO' };
    for (const url of [
      'https://youtu.be/abc123',
      'https://youtu.be/dQw4w9WgXcQx',
      'https://youtu.be/dQw4w9WgXc!',
      'https://youtu.be/',
      'https://youtu.be/dQw4w9WgXcQ/extra',
      'https://www.youtube.com/watch?v=short',
      'https://www.youtube.com/watch',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/channel/UC123',
      'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://evil.example/youtu.be/dQw4w9WgXcQ',
      'https://user@youtu.be/dQw4w9WgXcQ',
      'https://youtu.be:8443/dQw4w9WgXcQ',
      'javascript:alert(1)//youtu.be/dQw4w9WgXcQ',
      'not a url',
    ])
      expect(createMediaInput.safeParse({ ...base, url }).success, url).toBe(false);
  });

  it('derives video ids leniently for stored rows', () => {
    expect(youtubeVideoId('http://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://youtu.be/abc123')).toBeNull();
    expect(youtubeVideoId('ftp://youtu.be/dQw4w9WgXcQ')).toBeNull();
    expect(youtubeVideoId('garbage')).toBeNull();
    expect(canonicalYouTubeUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('validates the media list query', () => {
    expect(listMediaQuery.parse({})).toEqual({ page: 1, pageSize: DEFAULT_MEDIA_PAGE_SIZE });
    expect(listMediaQuery.parse({ page: '3', pageSize: '100' })).toMatchObject({
      page: 3,
      pageSize: 100,
    });
    expect(listMediaQuery.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(listMediaQuery.safeParse({ page: '0' }).success).toBe(false);
    expect(listMediaQuery.safeParse({ page: '100001' }).success).toBe(false);
    expect(DEFAULT_MEDIA_PAGE_SIZE).toBe(24);
  });

  it('treats a blank media search or tag as absent and trims the others', () => {
    for (const query of [{ search: '' }, { tag: '   ' }, { search: ' ', tag: '' }]) {
      const parsed = listMediaQuery.parse(query);
      expect(parsed, JSON.stringify(query)).toEqual({ page: 1, pageSize: 24 });
      expect(parsed.search).toBeUndefined();
      expect(parsed.tag).toBeUndefined();
    }
    expect(listMediaQuery.parse({ search: ' hymn ', tag: ' Worship ' })).toMatchObject({
      search: 'hymn',
      tag: 'Worship',
    });
    expect(listMediaQuery.safeParse({ search: 'x'.repeat(201) }).success).toBe(false);
    expect(listMediaQuery.safeParse({ tag: 'x'.repeat(101) }).success).toBe(false);
  });

  it('optionalQueryText drops blank values and keeps the max length', () => {
    const schema = optionalQueryText('Search', 5);
    expect(schema.parse(undefined)).toBeUndefined();
    expect(schema.parse('')).toBeUndefined();
    expect(schema.parse(' \t\n ')).toBeUndefined();
    expect(schema.parse('  abc  ')).toBe('abc');
    expect(schema.parse('       abcde      ')).toBe('abcde');
    expect(schema.safeParse('abcdef').success).toBe(false);
    expect(schema.safeParse(3).success).toBe(false);
  });

  it('requires a saved-search query that is a valid searchQuery', () => {
    const query = {
      conditions: [
        { field: 'engagement.membershipStage', operator: 'equals', value: 'new_member' },
      ],
      logic: 'AND',
    };
    expect(createSavedSearchInput.safeParse({ name: 'S' }).success).toBe(false);
    expect(createSavedSearchInput.safeParse({ name: 'S', query: { a: 1 } }).success).toBe(false);
    expect(
      createSavedSearchInput.safeParse({ name: 'S', query: { conditions: [], logic: 'AND' } })
        .success,
    ).toBe(false);
    expect(createSavedSearchInput.parse({ name: 'S', query }).query).toEqual(query);
  });

  it('exports the membership stages', () => {
    expect(membershipStage.options).toContain('new_member');
  });
});
