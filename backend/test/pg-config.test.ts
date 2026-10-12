import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
    // pg-config reads certificate files when it builds the config; the content is not parsed.
    let dir: string;
    let ca: string;
    const PEM = '-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----\n';
    const KEY = '-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----\n';
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'pg-config-'));
      ca = join(dir, 'ca.pem');
      writeFileSync(ca, PEM);
      writeFileSync(join(dir, 'client.pem'), PEM);
      writeFileSync(join(dir, 'client.key'), KEY);
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));
    const rootcert = () => `sslrootcert=${encodeURIComponent(ca)}`;
    const ssl = (query: string) => read(query).config.ssl;
    // checkServerIdentity is a no-op: the chain is checked, the host name is not.
    const chainOnly = {
      ca: PEM,
      rejectUnauthorized: true,
      checkServerIdentity: expect.any(Function),
    };

    it('keeps a plain connection without sslmode', () => {
      expect(ssl('')).toBeUndefined();
    });

    it.each(['disable', 'allow'])('connects without TLS for sslmode=%s', (mode) => {
      expect(ssl(`sslmode=${mode}`)).toBe(false);
    });

    it.each(['require', 'prefer'])('encrypts without verifying for sslmode=%s', (mode) => {
      expect(ssl(`sslmode=${mode}`)).toEqual({ rejectUnauthorized: false });
    });

    it.each(['require', 'prefer'])(
      'checks the chain but not the host name for sslmode=%s with sslrootcert (libpq verify-ca)',
      (mode) => {
        expect(ssl(`sslmode=${mode}&${rootcert()}`)).toEqual(chainOnly);
      },
    );

    it('checks the chain only for sslmode=verify-ca with sslrootcert', () => {
      expect(ssl(`sslmode=verify-ca&${rootcert()}`)).toEqual(chainOnly);
    });

    it('checks chain and host name for sslmode=verify-full, with or without sslrootcert', () => {
      expect(ssl('sslmode=verify-full')).toEqual({ rejectUnauthorized: true });
      expect(ssl(`sslmode=verify-full&${rootcert()}`)).toEqual({
        ca: PEM,
        rejectUnauthorized: true,
      });
    });

    it('verifies chain and host name against the default roots for sslrootcert=system', () => {
      for (const mode of ['require', 'prefer', 'verify-ca', 'verify-full']) {
        expect(ssl(`sslmode=${mode}&sslrootcert=system`)).toEqual({ rejectUnauthorized: true });
      }
      expect(ssl('sslmode=require&sslrootcert=system&sslaccept=strict')).toEqual({
        rejectUnauthorized: true,
      });
    });

    it('verifies chain and host name for sslaccept=strict (chain only for verify-ca)', () => {
      expect(ssl('sslmode=require&sslaccept=strict')).toEqual({ rejectUnauthorized: true });
      expect(ssl(`sslmode=require&${rootcert()}&sslaccept=strict`)).toEqual({
        ca: PEM,
        rejectUnauthorized: true,
      });
      expect(ssl(`sslmode=verify-ca&${rootcert()}&sslaccept=strict`)).toEqual(chainOnly);
      expect(ssl('sslmode=disable&sslaccept=strict')).toBe(false);
    });

    it('verifies nothing for sslaccept=accept_invalid_certs', () => {
      expect(ssl('sslmode=verify-full&sslaccept=accept_invalid_certs')).toEqual({
        rejectUnauthorized: false,
      });
      expect(ssl(`sslmode=verify-full&${rootcert()}&sslaccept=accept_invalid_certs`)).toEqual({
        ca: PEM,
        rejectUnauthorized: false,
      });
      expect(ssl(`sslmode=verify-ca&${rootcert()}&sslaccept=accept_invalid_certs`)).toEqual({
        ca: PEM,
        rejectUnauthorized: false,
      });
    });

    it('reads sslcert and sslkey together as a client certificate', () => {
      const query = `sslmode=verify-full&sslcert=${encodeURIComponent(join(dir, 'client.pem'))}&sslkey=${encodeURIComponent(join(dir, 'client.key'))}`;
      expect(ssl(query)).toEqual({ cert: PEM, key: KEY, rejectUnauthorized: true });
    });

    it('hands no libpq SSL parameter to pg', () => {
      const { config } = read(
        `sslmode=verify-full&${rootcert()}&sslcert=${encodeURIComponent(join(dir, 'client.pem'))}&sslkey=${encodeURIComponent(join(dir, 'client.key'))}&uselibpqcompat=true&application_name=church%20api&options=-c%20statement_timeout%3D5000`,
      );
      for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) {
        expect(config).not.toHaveProperty(key);
      }
      // The other parameters keep their values when the SSL ones are taken out of the query.
      expect(config).toMatchObject({
        application_name: 'church api',
        database: 'church',
        options: '-c statement_timeout=5000 -c search_path="public"',
      });
    });

    it.each(['no-verify', 'Require', 'verify_full', 'on', 'true'])('refuses sslmode=%s', (mode) => {
      const message = refusal(`${BASE}?sslmode=${mode}`);
      expect(message).toContain(
        'sslmode must be disable, allow, prefer, require, verify-ca or verify-full',
      );
      expect(message).not.toContain('db.example.org');
    });

    it('refuses an unknown sslaccept value, and sslaccept without sslmode', () => {
      expect(refusal(`${BASE}?sslmode=require&sslaccept=yes`)).toContain('sslaccept must be');
      expect(refusal(`${BASE}?sslaccept=strict`)).toContain(
        'set sslmode=require or verify-full together with sslaccept',
      );
    });

    it('refuses verify-ca without sslrootcert', () => {
      expect(refusal(`${BASE}?sslmode=verify-ca`)).toContain('verify-ca needs sslrootcert');
    });

    it('refuses sslcert without sslkey, which Prisma 6 read as the server CA', () => {
      for (const query of [`sslcert=${ca}`, `sslmode=require&sslcert=${ca}`]) {
        expect(refusal(`${BASE}?${query}`)).toContain(
          "Prisma 6 read sslcert as the server's CA; put the CA in sslrootcert",
        );
      }
    });

    it.each(['sslrootcert', 'sslkey'])('refuses %s without sslmode', (key) => {
      expect(refusal(`${BASE}?${key}=${encodeURIComponent(ca)}`)).toContain(
        `parameter ${key} needs sslmode: set sslmode`,
      );
    });

    it('refuses sslrootcert=system with sslaccept=accept_invalid_certs', () => {
      expect(
        refusal(`${BASE}?sslmode=require&sslrootcert=system&sslaccept=accept_invalid_certs`),
      ).toContain('remove sslaccept=accept_invalid_certs');
    });

    it('names an unreadable certificate file, never the URL', () => {
      const missing = join(dir, 'missing.pem');
      const message = refusal(`${BASE}?sslmode=verify-full&sslrootcert=${missing}`);
      expect(message).toContain(
        `sslrootcert names a file that cannot be read (ENOENT): ${missing}`,
      );
      expect(message).not.toContain('db.example.org');
    });
  });

  describe('pool', () => {
    it('uses connection_limit as the pool size, defaulting to CPUs * 2 + 1', () => {
      expect(read('connection_limit=3').config.max).toBe(3);
      expect(read().config.max).toBe(availableParallelism() * 2 + 1);
      for (const value of ['0', 'many', '1e1', '2.5', '-1', '+3', ' 3']) {
        expect(refusal(`${BASE}?connection_limit=${encodeURIComponent(value)}`)).toContain(
          'connection_limit must be a whole number of connections, at least 1',
        );
      }
    });

    it('waits connect_timeout (5 s by default), or the larger of it and an explicit pool_timeout', () => {
      expect(read().config.connectionTimeoutMillis).toBe(5_000);
      expect(read('connect_timeout=20').config.connectionTimeoutMillis).toBe(20_000);
      expect(read('pool_timeout=30').config.connectionTimeoutMillis).toBe(30_000);
      expect(read('connect_timeout=2&pool_timeout=3').config.connectionTimeoutMillis).toBe(3_000);
      expect(read('connect_timeout=7&pool_timeout=1').config.connectionTimeoutMillis).toBe(7_000);
      expect(refusal(`${BASE}?pool_timeout=soon`)).toContain('pool_timeout');
    });

    it.each(['connect_timeout', 'pool_timeout'])(
      'refuses %s=0, which would make pg wait forever, and fractions',
      (key) => {
        for (const value of ['0', '1.5', '-5', '1e3']) {
          expect(refusal(`${BASE}?${key}=${value}`)).toContain(
            `${key} must be a whole number of seconds, at least 1`,
          );
        }
      },
    );

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

  it.each([
    ['in the password', 'postgresql://church:ab#cd@db.example.org:5432/church'],
    ['in the query', 'postgresql://church:church@db.example.org:5432/church?schema=a#b'],
  ])('refuses an unencoded # (%s), which would cut the URL short', (_label, url) => {
    const message = refusal(url);
    expect(message).toContain('percent-encode # in the password');
    expect(message).not.toContain('church');
    expect(
      pgConfigFromUrl('postgresql://church:ab%23cd@db.example.org/church').config.password,
    ).toBe('ab#cd');
  });

  it('refuses anything but a postgresql:// or postgres:// URL', () => {
    expect(refusal('mysql://church:church@localhost/church')).toContain('must start with');
    expect(refusal('church_dev')).toContain('must start with');
    expect(pgConfigFromUrl('postgres://church@localhost/church').config.database).toBe('church');
  });
});
