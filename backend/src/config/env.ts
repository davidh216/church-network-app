import proxyaddr from 'proxy-addr';
import { z } from 'zod';
import { DatabaseUrlError, INVALID_DATABASE_URL, pgConfigFromUrl } from '../lib/pg-config';

// Load a local .env file when present (Node built-in; no dependency needed). Not under
// NODE_ENV=test: tests get their environment from vitest.config.mts only, so a developer's .env
// (RATE_LIMIT_AUTH_MAX, SEED_ADMIN_*, ...) cannot change how they behave.
if (process.env.NODE_ENV !== 'test') {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: rely on the process environment.
  }
}

const fields = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  // Read as the Prisma client will read it. The message never echoes the URL (or its password).
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .superRefine((url, ctx) => {
      // An empty value is already reported by min(1).
      if (!url) return;
      try {
        pgConfigFromUrl(url);
      } catch (error) {
        const message = error instanceof DatabaseUrlError ? error.message : INVALID_DATABASE_URL;
        ctx.addIssue({ code: 'custom', message });
      }
    }),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  // Comma-separated browser origins. Defaults to http://localhost:3000 outside production; in
  // production it must be set (see productionRules).
  CORS_ORIGIN: z.string().trim().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Attempts allowed per window. Login: five times this per IP, five times this per email
  // whatever the IP, and this many per IP and email; registration: this many per IP. Left unset,
  // it is 10 and the limits are off when NODE_ENV=test; setting it turns them on in tests too.
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).optional(),
  RATE_LIMIT_AUTH_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),
  // Express `trust proxy`: which upstream addresses may set X-Forwarded-For. The Next.js server
  // must be covered. Its rewrite adds no X-Forwarded-For of its own and passes a client-sent one
  // through unchanged, so client addresses are real only when a reverse proxy in front of Next
  // sets the header and Next is not reachable directly (see .env.example).
  TRUST_PROXY: z.string().trim().min(1).default('loopback, uniquelocal'),
  // Overrides the session cookie's Secure flag (default: on in production only). For a production
  // build served over plain HTTP, such as the local compose stack; leave unset behind TLS.
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
});

const DEV_CORS_ORIGIN = 'http://localhost:3000';
// Public addresses from both halves of an address family (IPv4; IPv6; an IPv4-mapped IPv6
// address with an IPv4 one). A TRUST_PROXY list that trusts both of a pair trusts (nearly) every
// client, such as 0.0.0.0/1,128.0.0.0/1 or ::ffff:0:0/96.
const PUBLIC_ADDRESS_PAIRS = [
  ['1.1.1.1', '129.0.0.1'],
  ['2001:db8::1', '8000::1'],
  ['::ffff:8.8.8.8', '129.0.0.1'],
] as const;

export function splitOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** Why a JWT secret is too weak for production, or null when it is acceptable. */
export function weakSecretReason(secret: string): string | null {
  if (new Set(secret).size === 1) return 'is one repeated character';
  if (new Set(secret).size < 10) return 'has fewer than 10 distinct characters';
  const word = ['changeme', 'secret', 'example'].find((w) => secret.toLowerCase().includes(w));
  if (word) return `contains "${word}"`;
  return null;
}

type Fields = z.infer<typeof fields>;

// Production refuses settings that are fine on a developer machine but unsafe on the internet.
function productionRules(config: Fields, ctx: z.RefinementCtx) {
  if (config.NODE_ENV !== 'production') return;
  const issue = (path: keyof Fields, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });

  const origins = splitOrigins(config.CORS_ORIGIN ?? '');
  if (origins.length === 0) {
    issue('CORS_ORIGIN', 'CORS_ORIGIN must be set in production (no localhost default)');
  } else if (config.COOKIE_SECURE !== 'false') {
    // An http:// origin would also send the session cookie over plain HTTP. COOKIE_SECURE=false
    // is the explicit opt-in for that (the local compose stack).
    const insecure = origins.filter((origin) => !origin.startsWith('https://'));
    if (insecure.length > 0) {
      issue(
        'CORS_ORIGIN',
        `every CORS_ORIGIN must be https:// in production unless COOKIE_SECURE=false (got ${insecure.join(', ')})`,
      );
    }
  }

  const weak = weakSecretReason(config.JWT_SECRET);
  if (weak) {
    issue('JWT_SECRET', `JWT_SECRET ${weak}; use a random value, e.g. openssl rand -base64 48`);
  }

  const trustProxy = config.TRUST_PROXY;
  if (trustProxy.toLowerCase() === 'true') {
    issue(
      'TRUST_PROXY',
      'TRUST_PROXY=true trusts any client-sent X-Forwarded-For; set a hop count or an address/subnet list',
    );
  } else if (typeof parseTrustProxy(trustProxy) === 'string') {
    // Compiled the way Express compiles it at app.set('trust proxy'), so a value it rejects is a
    // configuration error here rather than a crash at start-up.
    let trusts: ((addr: string, i: number) => boolean) | undefined;
    try {
      trusts = proxyaddr.compile(trustProxy.split(',').map((entry) => entry.trim()));
    } catch (error) {
      issue(
        'TRUST_PROXY',
        `TRUST_PROXY must be a hop count or a list of addresses, subnets or loopback, linklocal, uniquelocal (${(error as Error).message})`,
      );
    }
    if (trusts && PUBLIC_ADDRESS_PAIRS.some((pair) => pair.every((addr) => trusts(addr, 0)))) {
      issue(
        'TRUST_PROXY',
        "TRUST_PROXY trusts (nearly) every address; list only your proxy's address or subnet",
      );
    }
  }
}

const schema = fields
  .superRefine(productionRules)
  .transform((config) => ({ ...config, CORS_ORIGIN: config.CORS_ORIGIN ?? DEV_CORS_ORIGIN }));

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // The logger depends on this module, so configuration errors go straight to stderr.
  process.stderr.write(
    'Invalid environment configuration:\n' + z.prettifyError(parsed.error) + '\n',
  );
  process.exit(1);
}

export const env = parsed.data;
export const corsOrigins = splitOrigins(env.CORS_ORIGIN);

/**
 * The value for `app.set('trust proxy', ...)`: a hop count when TRUST_PROXY is an integer,
 * true/false for those words, otherwise the comma-separated address/subnet list as given.
 */
export function parseTrustProxy(value: string): number | boolean | string {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return trimmed;
}

export const trustProxy = parseTrustProxy(env.TRUST_PROXY);
