import type { Request } from 'express';
import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import { env } from '../config/env';

// Limits on login and registration attempts, per client IP (req.ip, which honours TRUST_PROXY).
// Off under NODE_ENV=test unless the test sets RATE_LIMIT_AUTH_MAX.
const max = env.RATE_LIMIT_AUTH_MAX ?? 10;

const shared: Partial<Options> = {
  windowMs: env.RATE_LIMIT_AUTH_WINDOW_MINUTES * 60 * 1000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test' && env.RATE_LIMIT_AUTH_MAX === undefined,
  message: { error: 'Too many attempts. Please try again later.', code: 'RATE_LIMITED' },
  // `trust proxy` is set deliberately from TRUST_PROXY, so skip the library's checks that warn
  // about permissive values and about X-Forwarded-For arriving from an untrusted address.
  validate: { trustProxy: false, xForwardedForHeader: false },
};

// The email a login attempt is for, normalised like the login lookup. A missing or non-string
// email (rejected by validation afterwards) still counts, under the empty email.
function loginEmail(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

// Registration: RATE_LIMIT_AUTH_MAX attempts per IP.
export const registerRateLimit = rateLimit({ ...shared, limit: max });

// Login, coarse guard: five times the per-account limit per IP, so one address cannot try
// many accounts, while users behind a shared address (NAT, the same office) are not locked out
// by each other.
export const loginIpRateLimit = rateLimit({ ...shared, limit: max * 5 });

// Login, per account: RATE_LIMIT_AUTH_MAX attempts per IP and email.
export const loginAccountRateLimit = rateLimit({
  ...shared,
  limit: max,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${loginEmail(req)}`,
});
