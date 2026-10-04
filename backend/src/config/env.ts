import { z } from 'zod';

// Load a local .env file when present (Node 22 built-in; no dependency needed).
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the process environment.
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Login and registration attempts allowed per IP per window. Left unset, the limit is 10 and
  // it is off when NODE_ENV=test; setting it turns the limit on in tests too.
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).optional(),
  RATE_LIMIT_AUTH_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),
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
