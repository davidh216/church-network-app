import { describe, expect, it } from 'vitest';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_MATCHES_EMAIL,
  changePasswordInput,
  createMediaInput,
  createSavedSearchInput,
  createUserInput,
  isCommonPassword,
  loginInput,
  membershipStage,
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

  it('requires a saved-search query', () => {
    expect(createSavedSearchInput.safeParse({ name: 'S' }).success).toBe(false);
    expect(createSavedSearchInput.safeParse({ name: 'S', query: { a: 1 } }).success).toBe(true);
  });

  it('exports the membership stages', () => {
    expect(membershipStage.options).toContain('new_member');
  });
});
