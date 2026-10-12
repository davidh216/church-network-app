import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

// PHASE4_SPECS.md U6: under NODE_ENV=production, env.ts refuses a missing or plain-HTTP
// CORS_ORIGIN, a weak JWT_SECRET, TRUST_PROXY=true, a TRUST_PROXY value Express cannot compile and
// one that trusts (nearly) every address, and exits with the usual message. Each test stubs the environment and loads env.ts afresh;
// backend/.env is not read (loadEnvFile is mocked), so a developer's own settings cannot change
// the outcome.
const STRONG_SECRET = 'q8Vb3NfLr0Tz7WcYp2HdKm5XsJ9aGu4E';

// What the compose stack sets for the api service (docker-compose.yml), plus a generated secret.
const COMPOSE = {
  NODE_ENV: 'production',
  CORS_ORIGIN: 'http://localhost:3000',
  COOKIE_SECURE: 'false',
  JWT_SECRET: STRONG_SECRET,
};

// A deployment behind TLS: COOKIE_SECURE unset, https origins only.
const BEHIND_TLS = {
  NODE_ENV: 'production',
  CORS_ORIGIN: 'https://church.example.org, https://www.church.example.org',
  COOKIE_SECURE: undefined,
  JWT_SECRET: STRONG_SECRET,
};

class Exit extends Error {}

let stderr: string;
let exit: MockInstance<typeof process.exit>;

beforeEach(() => {
  vi.resetModules();
  stderr = '';
  vi.spyOn(process, 'loadEnvFile').mockImplementation(() => undefined);
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Exit(`exit ${code}`);
  });
  // A TRUST_PROXY from the shell running the tests must not decide the outcome.
  vi.stubEnv('TRUST_PROXY', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function loadEnv(vars: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
  return import('../src/config/env.js');
}

async function refused(vars: Record<string, string | undefined>) {
  await expect(loadEnv(vars)).rejects.toThrow(Exit);
  expect(exit).toHaveBeenCalledWith(1);
  expect(stderr).toMatch(/^Invalid environment configuration:\n/);
  return stderr;
}

describe('production configuration', () => {
  it('accepts the compose stack settings', async () => {
    const { env, corsOrigins } = await loadEnv(COMPOSE);
    expect(env.NODE_ENV).toBe('production');
    expect(corsOrigins).toEqual(['http://localhost:3000']);
    expect(exit).not.toHaveBeenCalled();
  });

  it('accepts https origins with COOKIE_SECURE unset', async () => {
    const { corsOrigins } = await loadEnv(BEHIND_TLS);
    expect(corsOrigins).toEqual(['https://church.example.org', 'https://www.church.example.org']);
  });

  it('requires CORS_ORIGIN to be set, with no localhost default', async () => {
    for (const value of [undefined, '', ' , ']) {
      vi.resetModules();
      stderr = '';
      expect(await refused({ ...BEHIND_TLS, CORS_ORIGIN: value })).toContain(
        'CORS_ORIGIN must be set in production',
      );
    }
  });

  it('refuses a plain-HTTP origin unless COOKIE_SECURE=false', async () => {
    const message = await refused({
      ...BEHIND_TLS,
      CORS_ORIGIN: 'https://church.example.org,http://church.example.org',
    });
    expect(message).toContain('must be https://');
    expect(message).toContain('(got http://church.example.org)');
    expect(message).toContain('→ at CORS_ORIGIN');

    vi.resetModules();
    await refused({ ...COMPOSE, COOKIE_SECURE: 'true' });
    vi.resetModules();
    await refused({ ...COMPOSE, COOKIE_SECURE: undefined });
  });

  it.each([
    ['one repeated character', 'x'.repeat(40), 'is one repeated character'],
    ['fewer than 10 distinct characters', 'abcdefghi'.repeat(4), 'has fewer than 10 distinct'],
    ['changeme', `${STRONG_SECRET}ChangeMe`, 'contains "changeme"'],
    ['secret', `my-SECRET-${STRONG_SECRET}`, 'contains "secret"'],
    ['example', `${STRONG_SECRET}-Example`, 'contains "example"'],
  ])('refuses a JWT_SECRET made of %s', async (_label, secret, reason) => {
    const message = await refused({ ...COMPOSE, JWT_SECRET: secret });
    expect(message).toContain(`JWT_SECRET ${reason}`);
    expect(message).toContain('→ at JWT_SECRET');
    // The message never echoes the secret itself.
    expect(message).not.toContain(secret);
  });

  it('accepts a secret with exactly 10 distinct characters', async () => {
    await loadEnv({ ...COMPOSE, JWT_SECRET: '0123456789'.repeat(4) });
    expect(exit).not.toHaveBeenCalled();
  });

  it('refuses TRUST_PROXY=true, and accepts a hop count or an address list', async () => {
    for (const value of ['true', ' TRUE ']) {
      vi.resetModules();
      stderr = '';
      const message = await refused({ ...COMPOSE, TRUST_PROXY: value });
      expect(message).toContain('TRUST_PROXY=true trusts any client-sent X-Forwarded-For');
    }
    for (const [value, expected] of [
      ['1', 1],
      ['loopback, 10.0.0.0/8', 'loopback, 10.0.0.0/8'],
      ['false', false],
    ] as const) {
      vi.resetModules();
      const { trustProxy } = await loadEnv({ ...COMPOSE, TRUST_PROXY: value });
      expect(trustProxy).toBe(expected);
    }
  });

  it.each([
    '::ffff:0:0/96',
    '0.0.0.0/1,128.0.0.0/1',
    '::/1,8000::/1',
    'loopback, ::ffff:0.0.0.0/97, 128.0.0.0/1',
  ])('refuses a TRUST_PROXY list that trusts (nearly) every address (%j)', async (value) => {
    const message = await refused({ ...COMPOSE, TRUST_PROXY: value });
    expect(message).toContain(
      "TRUST_PROXY trusts (nearly) every address; list only your proxy's address or subnet",
    );
    expect(message).toContain('→ at TRUST_PROXY');
  });

  it.each(['0.0.0.0/0', '::/0', 'loopback,', '10.0.0.0/33', 'proxy.example.org', 'FALSE'])(
    'refuses a TRUST_PROXY value Express cannot compile (%j) instead of crashing later',
    async (value) => {
      const message = await refused({ ...COMPOSE, TRUST_PROXY: value });
      expect(message).toContain('TRUST_PROXY must be a hop count or a list of addresses');
      expect(message).toContain('→ at TRUST_PROXY');
    },
  );

  it('accepts private subnets, a CDN-style list of public ranges and a hop count', async () => {
    for (const [value, expected] of [
      ['10.0.0.0/8', '10.0.0.0/8'],
      ['loopback, uniquelocal', 'loopback, uniquelocal'],
      [
        '173.245.48.0/20, 104.16.0.0/13, 172.64.0.0/13, 2606:4700::/32',
        '173.245.48.0/20, 104.16.0.0/13, 172.64.0.0/13, 2606:4700::/32',
      ],
      ['0.0.0.0/8, ::1/128, fd00::/8', '0.0.0.0/8, ::1/128, fd00::/8'],
      ['1', 1],
    ] as const) {
      vi.resetModules();
      const { trustProxy } = await loadEnv({ ...COMPOSE, TRUST_PROXY: value });
      expect(trustProxy).toBe(expected);
    }
    expect(exit).not.toHaveBeenCalled();
  });

  it('reports every failing rule at once', async () => {
    const message = await refused({
      NODE_ENV: 'production',
      CORS_ORIGIN: undefined,
      JWT_SECRET: 'changeme-changeme-changeme-changeme',
      TRUST_PROXY: 'true',
    });
    expect(message).toContain('→ at CORS_ORIGIN');
    expect(message).toContain('→ at JWT_SECRET');
    expect(message).toContain('→ at TRUST_PROXY');
  });
});

describe('outside production', () => {
  it.each(['development', 'test'])(
    '%s keeps the localhost default and accepts the test secret',
    async (nodeEnv) => {
      const { env, corsOrigins } = await loadEnv({
        NODE_ENV: nodeEnv,
        CORS_ORIGIN: undefined,
        JWT_SECRET: 'test-only-secret-that-is-at-least-32-characters-long',
        TRUST_PROXY: 'true',
      });
      expect(env.CORS_ORIGIN).toBe('http://localhost:3000');
      expect(corsOrigins).toEqual(['http://localhost:3000']);
      expect(exit).not.toHaveBeenCalled();
    },
  );
});
