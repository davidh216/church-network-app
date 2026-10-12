import { availableParallelism } from 'node:os';
import { describe, expect, it } from 'vitest';
import { DatabaseUrlError, INVALID_DATABASE_URL, pgConfigFromUrl } from '../src/lib/pg-config';

// DATABASE_URL keeps the meaning it had under Prisma 6 now that pg makes the connections
// (PHASE4_SPECS.md U5): libpq SSL modes, Prisma's pool parameters, and `schema`.
const BASE = 'postgresql://church:church@db.example.org:5432/church';
const read = (query = '') => pgConfigFromUrl(`${BASE}${query ? `?${query}` : ''}`);

function refusal(url: string) {
  try {
    pgConfigFromUrl(url);
  } catch (error) {
    expect(error).toBeInstanceOf(DatabaseUrlError);
    return (error as Error).message;
  }
  throw new Error('expected the URL to be refused');
}

describe('pgConfigFromUrl', () => {
  it('reads the connection fields and defaults the schema to public', () => {
    const { config, schema } = pgConfigFromUrl(
      'postgresql://church:p%40ss%2Fw0rd@db.example.org:6543/church_dev',
    );
    expect(schema).toBe('public');
    expect(config).toMatchObject({
      host: 'db.example.org',
      port: 6543,
      user: 'church',
      password: 'p@ss/w0rd',
      database: 'church_dev',
      options: '-c search_path="public"',
    });
  });

  describe('SSL (libpq semantics, as Prisma 6 accepted invalid certificates by default)', () => {
    it('keeps a plain connection without sslmode', () => {
      expect(read().config.ssl).toBeUndefined();
    });

    it.each(['require', 'prefer'])('encrypts without verifying for sslmode=%s', (mode) => {
      expect(read(`sslmode=${mode}`).config.ssl).toEqual({ rejectUnauthorized: false });
    });

    it('verifies the certificate for sslmode=verify-full', () => {
      expect(read('sslmode=verify-full').config.ssl).toEqual({ rejectUnauthorized: true });
    });

    it('turns TLS off for sslmode=disable', () => {
      expect(read('sslmode=disable').config.ssl).toBe(false);
    });

    it('verifies for sslaccept=strict and not for sslaccept=accept_invalid_certs', () => {
      expect(read('sslmode=require&sslaccept=strict').config.ssl).toEqual({
        rejectUnauthorized: true,
      });
      expect(read('sslmode=verify-full&sslaccept=accept_invalid_certs').config.ssl).toEqual({
        rejectUnauthorized: false,
      });
    });

    it('refuses an unknown sslaccept value and verify-ca without a root certificate', () => {
      expect(refusal(`${BASE}?sslmode=require&sslaccept=yes`)).toContain('sslaccept must be');
      expect(refusal(`${BASE}?sslmode=verify-ca`)).toContain('sslrootcert');
    });
  });

  describe('pool', () => {
    it('uses connection_limit as the pool size, defaulting to CPUs * 2 + 1', () => {
      expect(read('connection_limit=3').config.max).toBe(3);
      expect(read().config.max).toBe(availableParallelism() * 2 + 1);
      expect(refusal(`${BASE}?connection_limit=0`)).toContain('connection_limit');
      expect(refusal(`${BASE}?connection_limit=many`)).toContain('connection_limit');
    });

    it('waits connect_timeout (5 s by default), or the larger of it and an explicit pool_timeout', () => {
      expect(read().config.connectionTimeoutMillis).toBe(5_000);
      expect(read('connect_timeout=20').config.connectionTimeoutMillis).toBe(20_000);
      expect(read('pool_timeout=30').config.connectionTimeoutMillis).toBe(30_000);
      expect(read('connect_timeout=2&pool_timeout=3').config.connectionTimeoutMillis).toBe(3_000);
      expect(read('connect_timeout=7&pool_timeout=1').config.connectionTimeoutMillis).toBe(7_000);
      expect(refusal(`${BASE}?pool_timeout=soon`)).toContain('pool_timeout');
    });

    it('closes idle connections after 5 minutes', () => {
      expect(read().config.idleTimeoutMillis).toBe(300_000);
    });
  });

  describe('schema and search_path', () => {
    it('returns the schema and appends its search_path to the URL options', () => {
      const { config, schema } = read(
        'schema=fixture_d5_services&options=-c%20statement_timeout%3D5000',
      );
      expect(schema).toBe('fixture_d5_services');
      expect(config.options).toBe('-c statement_timeout=5000 -c search_path="fixture_d5_services"');
    });

    it.each(['a-b', 'a b', '1abc', 'x"y', 'a\\b'])('refuses the schema %j', (name) => {
      expect(refusal(`${BASE}?schema=${encodeURIComponent(name)}`)).toContain(
        'schema must be a plain identifier',
      );
    });
  });

  it('hands none of the Prisma-only or libpq SSL parameters to pg', () => {
    const { config } = read(
      [
        'schema=app',
        'connection_limit=4',
        'connect_timeout=3',
        'pool_timeout=4',
        'socket_timeout=9',
        'pgbouncer=true',
        'statement_cache_size=0',
        'sslmode=require',
        'sslaccept=accept_invalid_certs',
        'sslidentity=id.p12',
        'sslpassword=pw',
        'application_name=church-api',
      ].join('&'),
    );
    for (const key of [
      'schema',
      'connection_limit',
      'connect_timeout',
      'pool_timeout',
      'socket_timeout',
      'pgbouncer',
      'statement_cache_size',
      'sslmode',
      'sslaccept',
      'sslidentity',
      'sslpassword',
    ]) {
      expect(config).not.toHaveProperty(key);
    }
    expect(config).toMatchObject({ application_name: 'church-api', max: 4 });
  });

  it('accepts a unix-socket URL', () => {
    const { config } = pgConfigFromUrl('postgresql://church@/church_dev?host=/var/run/postgresql');
    expect(config).toMatchObject({
      host: '/var/run/postgresql',
      user: 'church',
      database: 'church_dev',
    });
    // No password in the URL: pg falls back to PGPASSWORD or ~/.pgpass, as libpq does.
    expect(config).not.toHaveProperty('password');
  });

  it.each([
    ['letters after the slash', 'postgresql://church:ab/cd@db.example.org:5432/church'],
    ['digits before the slash', 'postgresql://church:12/34@db.example.org:5432/church'],
  ])('refuses a password with an unencoded special character (%s)', (_label, url) => {
    const message = refusal(url);
    expect(message).toBe(INVALID_DATABASE_URL);
    expect(message).not.toContain('church');
  });

  it('refuses anything but a postgresql:// or postgres:// URL', () => {
    expect(refusal('mysql://church:church@localhost/church')).toContain('must start with');
    expect(refusal('church_dev')).toContain('must start with');
    expect(pgConfigFromUrl('postgres://church@localhost/church').config.database).toBe('church');
  });
});
