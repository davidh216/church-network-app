import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import type { ConnectionOptions } from 'node:tls';
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

// libpq SSL parameters. They are read here (sslOptions) and removed from the URL before
// pg-connection-string parses it, so its own SSL handling never sees them.
const SSL_KEYS = ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat'] as const;

const SSL_MODES = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'];

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/;

/** Prisma 6's defaults: num_cpus * 2 + 1 connections, 5 s to connect, 10 s to wait for one. */
export const DEFAULT_CONNECT_TIMEOUT_SECONDS = 5;
export const IDLE_TIMEOUT_MILLIS = 300_000;
export const defaultPoolSize = () => availableParallelism() * 2 + 1;

/** A whole number >= 1 from the URL, or the fallback when the parameter is absent or empty. */
function positiveInteger(value: unknown, key: string, unit: string, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < 1) {
    throw new DatabaseUrlError(
      `DATABASE_URL parameter ${key} must be a whole number of ${unit}, at least 1`,
    );
  }
  return Number(value);
}

function readPem(key: string, path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'unreadable';
    throw new DatabaseUrlError(
      `DATABASE_URL parameter ${key} names a file that cannot be read (${code}): ${path}`,
    );
  }
}

type SslParams = Partial<Record<(typeof SSL_KEYS)[number] | 'sslaccept', string>>;

/**
 * The pg `ssl` option for the URL's libpq SSL parameters, or undefined without `sslmode`.
 *
 * - `disable` and `allow` connect without TLS.
 * - `prefer` and `require` encrypt without checking the certificate, as Prisma 6 did by default.
 *   pg cannot fall back to a plain connection, so `prefer` needs a server that accepts TLS.
 * - `verify-ca` checks the certificate chain against `sslrootcert`; `verify-full` checks the chain
 *   (against `sslrootcert`, or Node's default roots) and the host name. As in libpq, `require` or
 *   `prefer` with an `sslrootcert` checks the chain.
 * - `sslrootcert=system` checks chain and host name against Node's default roots, whatever the
 *   mode (libpq allows it with verify-full only).
 * - Prisma's `sslaccept=strict` checks chain and host name (chain only for verify-ca);
 *   `sslaccept=accept_invalid_certs` checks nothing.
 * - `sslcert` and `sslkey` are a client certificate. File paths resolve from the working directory.
 */
function sslOptions(p: SslParams): boolean | ConnectionOptions | undefined {
  const { sslmode, sslaccept, sslrootcert, sslcert, sslkey } = p;
  if (sslaccept !== undefined && sslaccept !== 'strict' && sslaccept !== 'accept_invalid_certs') {
    throw new DatabaseUrlError(
      'DATABASE_URL parameter sslaccept must be strict or accept_invalid_certs',
    );
  }
  if (sslcert !== undefined && sslkey === undefined) {
    throw new DatabaseUrlError(
      "DATABASE_URL parameter sslcert needs sslkey (a client certificate): Prisma 6 read sslcert as the server's CA; put the CA in sslrootcert",
    );
  }
  if (sslmode === undefined) {
    // Without sslmode the connection is plain; parameters that only make sense with TLS would
    // be ignored silently, so they are refused.
    if (sslaccept !== undefined) {
      throw new DatabaseUrlError(
        'DATABASE_URL parameter sslaccept needs sslmode: set sslmode=require or verify-full together with sslaccept',
      );
    }
    const orphan = (['sslrootcert', 'sslcert', 'sslkey'] as const).find((k) => p[k] !== undefined);
    if (orphan) {
      throw new DatabaseUrlError(
        `DATABASE_URL parameter ${orphan} needs sslmode: set sslmode (for example verify-full); without it the connection is not encrypted`,
      );
    }
    return undefined;
  }
  if (!SSL_MODES.includes(sslmode)) {
    throw new DatabaseUrlError(
      'DATABASE_URL parameter sslmode must be disable, allow, prefer, require, verify-ca or verify-full',
    );
  }
  if (sslmode === 'disable' || sslmode === 'allow') return false;

  const system = sslrootcert === 'system';
  if (system && sslaccept === 'accept_invalid_certs') {
    throw new DatabaseUrlError(
      'DATABASE_URL parameter sslrootcert=system verifies the server certificate; remove sslaccept=accept_invalid_certs',
    );
  }
  if (sslmode === 'verify-ca' && sslrootcert === undefined) {
    throw new DatabaseUrlError(
      'DATABASE_URL parameter sslmode=verify-ca needs sslrootcert (the CA that signed the server certificate); use sslmode=verify-full to check against the system roots',
    );
  }

  const tls: ConnectionOptions = {};
  if (sslrootcert !== undefined && !system) tls.ca = readPem('sslrootcert', sslrootcert);
  if (sslcert !== undefined && sslkey !== undefined) {
    tls.cert = readPem('sslcert', sslcert);
    tls.key = readPem('sslkey', sslkey);
  }

  let verify: 'none' | 'chain' | 'full';
  if (system || sslmode === 'verify-full') verify = 'full';
  else if (sslmode === 'verify-ca' || tls.ca !== undefined) verify = 'chain';
  else verify = 'none';
  if (sslaccept === 'strict') verify = sslmode === 'verify-ca' ? 'chain' : 'full';
  if (sslaccept === 'accept_invalid_certs') verify = 'none';

  tls.rejectUnauthorized = verify !== 'none';
  if (verify === 'chain') tls.checkServerIdentity = () => undefined;
  return tls;
}

/**
 * The pg pool configuration and Prisma schema for a DATABASE_URL, read the way Prisma 6 read it:
 *
 * - SSL follows libpq's `sslmode` and Prisma's `sslaccept` (see sslOptions). Without `sslmode`
 *   the connection is plain: Prisma 6 tried TLS first and fell back, but pg has no such fallback,
 *   so a server that only accepts TLS needs `sslmode=require` (or stricter) in the URL.
 * - `connection_limit` is the pool size (default: available CPUs * 2 + 1, as in Prisma 6).
 * - Prisma 6 waited `connect_timeout` (default 5 s) for a new connection and `pool_timeout`
 *   (default 10 s) for a free one. pg has one setting for both. It is `connect_timeout` (5 s by
 *   default, so /health answers 503 promptly when the database stops responding), or the larger
 *   of the two when the URL sets `pool_timeout`. Both must be at least 1 when given (0 would make
 *   pg wait forever). Idle connections close after 5 minutes.
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
  // An unencoded '#' starts a URL fragment: everything after it (the rest of the password, the
  // host, the query) would be dropped without an error.
  if (url.includes('#')) {
    throw new DatabaseUrlError(
      'DATABASE_URL contains an unencoded #; percent-encode # in the password (%23)',
    );
  }

  // The SSL parameters are taken out of the query first: pg-connection-string would read
  // certificate files and pick TLS options before they could be checked.
  const queryStart = url.indexOf('?');
  const query = new URLSearchParams(queryStart < 0 ? '' : url.slice(queryStart + 1));
  const lastValue = (key: string) => query.getAll(key).filter(Boolean).at(-1);
  const sslParams: SslParams = { sslaccept: lastValue('sslaccept') };
  for (const key of SSL_KEYS) sslParams[key] = lastValue(key);
  const ssl = sslOptions(sslParams);
  let withoutSsl = url;
  if (SSL_KEYS.some((key) => query.has(key))) {
    for (const key of SSL_KEYS) query.delete(key);
    withoutSsl = url.slice(0, queryStart) + (query.size > 0 ? `?${query.toString()}` : '');
  }

  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(withoutSsl, { useLibpqCompat: true });
  } catch (error) {
    if (error instanceof TypeError) throw new DatabaseUrlError(INVALID_DATABASE_URL);
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

  const max = positiveInteger(
    parsed.connection_limit,
    'connection_limit',
    'connections',
    defaultPoolSize(),
  );
  const connectTimeout = positiveInteger(
    parsed.connect_timeout,
    'connect_timeout',
    'seconds',
    DEFAULT_CONNECT_TIMEOUT_SECONDS,
  );
  // Only an explicit pool_timeout lengthens the wait; by default the 5 s connect timeout keeps
  // /health prompt when the database host stops answering.
  const poolTimeout = positiveInteger(parsed.pool_timeout, 'pool_timeout', 'seconds', 0);

  const options = [parsed.options, `-c search_path="${schema}"`].filter(Boolean).join(' ');

  for (const key of PRISMA_KEYS) delete parsed[key];
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
    // sslmode decides; without it, pg's own `ssl=true` query parameter still applies.
    ...(ssl !== undefined && { ssl }),
    options,
    max,
    connectionTimeoutMillis: Math.max(connectTimeout, poolTimeout) * 1000,
    idleTimeoutMillis: IDLE_TIMEOUT_MILLIS,
  };
  return { config, schema };
}
