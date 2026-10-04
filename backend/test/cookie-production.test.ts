import { describe, expect, it, vi } from 'vitest';

// The env is read when modules load, so the module is imported after stubbing (see rate-limit.test.ts).
describe('session cookie in production', () => {
  it('is Secure, HttpOnly, SameSite=Lax and scoped to /', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { sessionCookieOptions, SESSION_COOKIE } = await import('../src/middleware/auth.js');
    expect(SESSION_COOKIE).toBe('embrace_session');
    expect(sessionCookieOptions()).toEqual({
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: true,
    });
  });
});
