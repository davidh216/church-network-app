import { describe, expect, it } from 'vitest';
import { isPublicPath, safeNextPath } from './paths';

describe('isPublicPath', () => {
  it('is true only for the sign-in and registration pages', () => {
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/register')).toBe(true);
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/login/extra')).toBe(false);
  });
});

describe('safeNextPath', () => {
  it.each([
    ['/members?tab=1', '/members?tab=1'],
    ['/', '/'],
  ])('keeps the in-app path %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    '',
    'members',
    '//evil.example',
    '/\\evil.example',
    'https://evil.example',
    '/login',
    '/register?x=1',
  ])('falls back to / for %s', (input) => {
    expect(safeNextPath(input)).toBe('/');
  });
});
