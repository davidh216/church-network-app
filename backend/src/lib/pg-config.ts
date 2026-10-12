import { availableParallelism } from 'node:os';
import type { PoolConfig } from 'pg';
import { parse, toClientConfig } from 'pg-connection-string';

// Imported by the API (lib/prisma.ts, config/env.ts) and by the seed (prisma/seed.ts), so it
// depends on nothing else in src/.

/** A DATABASE_URL that cannot be used. The message never contains the URL or its password. */
export class DatabaseUrlError extends Error {
  override name = 'DatabaseUrlError';
}

export const INVALID_DATABASE_URL =
  'DATABASE_URL is not a valid connection URL; percent-encode special characters in the password';

// Query parameters only Prisma understands. pg would ignore most of them, but they are read here
// and never handed to the driver.
const PRISMA_KEYS = [
  'schema',
  'connection_limit',
  'connect_timeout',
  'pool_timeout',
  'socket_timeout',
  'pgbouncer',
  'statement_cache_size',
  'sslaccept',
  'sslidentity',
  'sslpassword',
] as const;

// libpq parameters pg-connection-string has already turned into the `ssl` option.
const CONSUMED_KEYS = ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'] as const;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/;

/** Prisma 6's defaults: num_cpus * 2 + 1 connections, 5 s to connect, 10 s to wait for one. */
export const DEFAULT_CONNECT_TIMEOUT_SECONDS = 5;
export const IDLE_TIMEOUT_MILLIS = 300_000;
export const defaultPoolSize = () => availableParallelism() * 2 + 1;

function seconds(value: unknown, key: string, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new DatabaseUrlError(`DATABASE_URL parameter ${key} must be a number of seconds`);
  }
  return n;
}

/**
 * The pg pool configuration and Prisma schema for a DATABASE_URL, read the way Prisma 6 read it:
 *
 * - SSL follows libpq: `sslmode=require` and `prefer` encrypt without verifying the certificate
 *   (Prisma 6's default `sslaccept=accept_invalid_certs`), `verify-ca` and `verify-full` verify,
 *   and `disable` turns TLS off. Prisma's `sslaccept=strict` forces verification and
 *   `sslaccept=accept_invalid_certs` turns it off. Without `sslmode` the connection is plain:
 *   Prisma 6 tried TLS first and fell back, but pg has no such fallback, so a server that only
 *   accepts TLS needs `sslmode=require` (or stricter) in the URL.
 * - `connection_limit` is the pool size (default: available CPUs * 2 + 1, as in Prisma 6).
 * - Prisma 6 waited `connect_timeout` (default 5 s) for a new connection and `pool_timeout`
 *   (default 10 s) for a free one. pg has one setting for both. It is `connect_timeout` (5 s by
 *   default, so /health answers 503 promptly when the database stops responding), or the larger
 *   of the two when the URL sets `pool_timeout`. Idle connections close after 5 minutes.
 * - `schema` (default `public`) is returned for the adapter, which names it in the queries Prisma
 *   generates, and is appended to the URL's own `options` as `-c search_path=...`, as Prisma 6 set
 *   it, so raw SQL sees the same tables. It must be a plain identifier.
 * - The other Prisma-only parameters (`socket_timeout`, `pgbouncer`, `statement_cache_size`,
 *   `sslidentity`, `sslpassword`) are dropped.
 *
 * Throws DatabaseUrlError, whose message never contains the URL.
 */
export function pgConfigFromUrl(url: string): { config: PoolConfig; schema: string } {
  // Checked here, before any parser can echo the input in an error.
  if (!/^postgres(?:ql)?:\/\//i.test(url)) {
    throw new DatabaseUrlError('DATABASE_URL must start with postgresql:// or postgres://');
  }

  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(url, { useLibpqCompat: true });
  } catch (error) {
    if (error instanceof TypeError) throw new DatabaseUrlError(INVALID_DATABASE_URL);
    // Unreadable certificate files and contradictory SSL settings: the message names a file or
    // a parameter, never the password.
    const reason = error instanceof Error ? error.message : String(error);
    throw new DatabaseUrlError(`DATABASE_URL cannot be used: ${reason}`);
  }

  // An unencoded '/' or '@' in the password moves the rest of it into the database name, where
  // neither character can appear unencoded.
  if (typeof parsed.database === 'string' && /[/@]/.test(parsed.database)) {
    throw new DatabaseUrlError(INVALID_DATABASE_URL);
  }

  const schema = typeof parsed.schema === 'string' && parsed.schema ? parsed.schema : 'public';
  if (!IDENTIFIER.test(schema)) {
    throw new DatabaseUrlError(
      'DATABASE_URL parameter schema must be a plain identifier (letters, digits, _ and $, not starting with a digit)',
    );
  }

  let max = defaultPoolSize();
  if (parsed.connection_limit !== undefined && parsed.connection_limit !== '') {
    max = Number(parsed.connection_limit);
    if (!Number.isInteger(max) || max < 1) {
      throw new DatabaseUrlError(
        'DATABASE_URL parameter connection_limit must be a positive integer',
      );
    }
  }
  const connectTimeout = seconds(
    parsed.connect_timeout,
    'connect_timeout',
    DEFAULT_CONNECT_TIMEOUT_SECONDS,
  );
  // Only an explicit pool_timeout lengthens the wait; by default the 5 s connect timeout keeps
  // /health prompt when the database host stops answering.
  const poolTimeout = seconds(parsed.pool_timeout, 'pool_timeout', 0);

  const sslaccept = parsed.sslaccept;
  if (sslaccept !== undefined && sslaccept !== 'strict' && sslaccept !== 'accept_invalid_certs') {
    throw new DatabaseUrlError(
      'DATABASE_URL parameter sslaccept must be strict or accept_invalid_certs',
    );
  }
  if (parsed.ssl === true && sslaccept) parsed.ssl = {};
  if (parsed.ssl && typeof parsed.ssl === 'object' && sslaccept) {
    const ssl = parsed.ssl as { rejectUnauthorized?: boolean; checkServerIdentity?: unknown };
    ssl.rejectUnauthorized = sslaccept === 'strict';
    // verify-ca checks the certificate chain only; otherwise strict checks the host name too.
    if (sslaccept === 'strict' && parsed.sslmode !== 'verify-ca') delete ssl.checkServerIdentity;
  }
  if (parsed.ssl && typeof parsed.ssl === 'object') {
    // Spelled out: verify unless a mode or sslaccept above said not to (Node's default too).
    parsed.ssl.rejectUnauthorized ??= true;
  }

  const options = [parsed.options, `-c search_path="${schema}"`].filter(Boolean).join(' ');

  for (const key of [...PRISMA_KEYS, ...CONSUMED_KEYS]) delete parsed[key];
  for (const key of ['host', 'user', 'password', 'port'] as const) {
    if (parsed[key] === '') delete parsed[key];
  }

  let clientConfig: ReturnType<typeof toClientConfig>;
  try {
    clientConfig = toClientConfig(parsed);
  } catch (error) {
    // "Invalid port: <port>"
    throw new DatabaseUrlError(`DATABASE_URL cannot be used: ${(error as Error).message}`);
  }
  const config: PoolConfig = {
    ...clientConfig,
    options,
    max,
    connectionTimeoutMillis: Math.max(connectTimeout, poolTimeout) * 1000,
    idleTimeoutMillis: IDLE_TIMEOUT_MILLIS,
  };
  return { config, schema };
}
