import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The env is read when modules load, so each test stubs it and then imports the module afresh
// (see rate-limit.test.ts). Outside NODE_ENV=test env.ts would also read backend/.env, which is
// switched off here so a developer's own settings cannot change the outcome.
async function cookieOptions(vars: Record<string, string>) {
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
  const { sessionCookieOptions } = await import('../src/middleware/auth.js');
  return sessionCookieOptions();
}

let loadEnvFile: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  loadEnvFile = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

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

describe('COOKIE_SECURE override', () => {
  it('false drops Secure in production (plain-HTTP compose stack)', async () => {
    expect(await cookieOptions({ NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toEqual({
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false,
    });
  });

  it('true sets Secure outside production', async () => {
    expect(await cookieOptions({ NODE_ENV: 'development', COOKIE_SECURE: 'true' })).toMatchObject({
      secure: true,
    });
    vi.resetModules();
    expect(await cookieOptions({ NODE_ENV: 'test', COOKIE_SECURE: 'true' })).toMatchObject({
      secure: true,
    });
  });

  it('unset follows NODE_ENV', async () => {
    expect(await cookieOptions({ NODE_ENV: 'development' })).toMatchObject({ secure: false });
    expect(loadEnvFile).toHaveBeenCalled();
  });
});
