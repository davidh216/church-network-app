import { z } from 'zod';

// Load a local .env file when present (Node 22 built-in; no dependency needed). Not under
// NODE_ENV=test: tests get their environment from vitest.config.mts only, so a developer's .env
// (RATE_LIMIT_AUTH_MAX, SEED_ADMIN_*, ...) cannot change how they behave.
if (process.env.NODE_ENV !== 'test') {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: rely on the process environment.
  }
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
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

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // The logger depends on this module, so configuration errors go straight to stderr.
  process.stderr.write(
    'Invalid environment configuration:\n' + z.prettifyError(parsed.error) + '\n',
  );
  process.exit(1);
}

export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

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
