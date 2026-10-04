import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// env.ts loads ./.env except under NODE_ENV=test, so a developer's backend/.env cannot leak into
// test runs. Each test runs env.ts afresh from a temporary directory holding such a file.
const LEAKED = ['ENV_FILE_SENTINEL', 'RATE_LIMIT_AUTH_MAX'] as const;

describe('.env loading', () => {
  const cwd = process.cwd();
  let dir: string;

  beforeEach(() => {
    for (const name of LEAKED) expect(process.env[name]).toBeUndefined();
    dir = mkdtempSync(join(tmpdir(), 'env-file-'));
    writeFileSync(join(dir, '.env'), 'ENV_FILE_SENTINEL=loaded\nRATE_LIMIT_AUTH_MAX=2\n');
    process.chdir(dir);
    vi.resetModules();
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
    for (const name of LEAKED) delete process.env[name];
    vi.unstubAllEnvs();
  });

  it('does not read .env when NODE_ENV=test', async () => {
    expect(process.env.NODE_ENV).toBe('test');
    const { env } = await import('../src/config/env.js');
    expect(process.env.ENV_FILE_SENTINEL).toBeUndefined();
    expect(env.RATE_LIMIT_AUTH_MAX).toBeUndefined();
  });

  it('reads .env otherwise', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { env } = await import('../src/config/env.js');
    expect(process.env.ENV_FILE_SENTINEL).toBe('loaded');
    expect(env.RATE_LIMIT_AUTH_MAX).toBe(2);
  });
});

// The generated Prisma client loads backend/.env into process.env when it is required and again
// when a client is constructed (only where backend/.env existed at `prisma generate`).
describe('.env loading by the Prisma client', () => {
  afterEach(() => {
    vi.doUnmock('@prisma/client');
    delete process.env.RATE_LIMIT_AUTH_MAX;
  });

  it('happened in test/setup-env.mts, which removed what it added', async () => {
    const before = { ...process.env };
    await import('@prisma/client');
    expect({ ...process.env }).toEqual(before);
  });

  it('comes after config/env.ts has parsed the environment', async () => {
    vi.resetModules();
    // Stand-in for the client's dotenv load, on require and on construction.
    vi.doMock('@prisma/client', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@prisma/client')>();
      process.env.RATE_LIMIT_AUTH_MAX = '2';
      class PrismaClient extends actual.PrismaClient {
        constructor(...args: ConstructorParameters<typeof actual.PrismaClient>) {
          process.env.RATE_LIMIT_AUTH_MAX = '2';
          super(...args);
        }
      }
      return { ...actual, PrismaClient };
    });
    // test/helpers.ts imports src/lib/prisma before src/app.
    await import('../src/lib/prisma.js');
    const { env } = await import('../src/config/env.js');
    expect(process.env.RATE_LIMIT_AUTH_MAX).toBe('2');
    expect(env.RATE_LIMIT_AUTH_MAX).toBeUndefined();
  });
});
