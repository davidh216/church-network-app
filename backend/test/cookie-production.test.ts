import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The env is read when modules load, so each test stubs it and then imports the module afresh
// (see rate-limit.test.ts). Outside NODE_ENV=test env.ts would also read backend/.env, which is
// switched off here so a developer's own settings cannot change the outcome.
// Production refuses the test suite's JWT secret and plain-HTTP origin (env.ts), so production
// cases run with settings it accepts: those of a deployment behind TLS.
const PRODUCTION = {
  NODE_ENV: 'production',
  JWT_SECRET: 'q8Vb3NfLr0Tz7WcYp2HdKm5XsJ9aGu4E',
  CORS_ORIGIN: 'https://church.example.org',
};

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
    for (const [name, value] of Object.entries(PRODUCTION)) vi.stubEnv(name, value);
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
    expect(await cookieOptions({ ...PRODUCTION, COOKIE_SECURE: 'false' })).toEqual({
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
    // A COOKIE_SECURE set in the shell running the tests must not decide the outcome.
    vi.stubEnv('COOKIE_SECURE', undefined);
    expect(await cookieOptions({ NODE_ENV: 'development' })).toMatchObject({ secure: false });
    expect(loadEnvFile).toHaveBeenCalled();
  });
});
