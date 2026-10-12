import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

// env.ts reads DATABASE_URL the way the Prisma client will (pgConfigFromUrl) and refuses one it
// cannot use at start-up, with a message that never repeats the URL or its password. Each test
// loads env.ts afresh; backend/.env is not read (loadEnvFile is mocked).
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
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function loadWith(databaseUrl: string) {
  vi.stubEnv('DATABASE_URL', databaseUrl);
  return import('../src/config/env.js');
}

describe('DATABASE_URL', () => {
  it('refuses a password with an unencoded slash without printing it', async () => {
    const password = 'Sup3rS3cret/Pa55word';
    await expect(
      loadWith(`postgresql://church:${password}@db.example.org:5432/church?schema=public`),
    ).rejects.toThrow(Exit);
    expect(exit).toHaveBeenCalledWith(1);
    expect(stderr).toMatch(/^Invalid environment configuration:\n/);
    expect(stderr).toContain(
      'DATABASE_URL is not a valid connection URL; percent-encode special characters in the password',
    );
    expect(stderr).toContain('→ at DATABASE_URL');
    for (const part of [password, 'Sup3rS3cret', 'Pa55word', 'db.example.org']) {
      expect(stderr).not.toContain(part);
    }
  });

  it('refuses a schema that is not a plain identifier', async () => {
    await expect(
      loadWith('postgresql://church:church@localhost:5432/church?schema=a%20b'),
    ).rejects.toThrow(Exit);
    expect(stderr).toContain('schema must be a plain identifier');
  });

  it('reports an empty DATABASE_URL once', async () => {
    await expect(loadWith('')).rejects.toThrow(Exit);
    expect(stderr).toContain('DATABASE_URL is required');
    expect(stderr.match(/→ at DATABASE_URL/g)).toHaveLength(1);
  });

  it('refuses an unencoded # without printing the password', async () => {
    await expect(
      loadWith('postgresql://church:Sup3r#S3cret@db.example.org:5432/church'),
    ).rejects.toThrow(Exit);
    expect(stderr).toContain('percent-encode # in the password');
    expect(stderr).not.toContain('Sup3r');
    expect(stderr).not.toContain('S3cret');
  });

  it('accepts a unix-socket URL', async () => {
    const { env } = await loadWith('postgresql://church@/church_dev?host=/var/run/postgresql');
    expect(env.DATABASE_URL).toBe('postgresql://church@/church_dev?host=/var/run/postgresql');
    expect(exit).not.toHaveBeenCalled();
  });

  it('accepts a percent-encoded password', async () => {
    await loadWith('postgresql://church:Sup3rS3cret%2FPa55word@localhost:5432/church');
    expect(exit).not.toHaveBeenCalled();
  });
});
