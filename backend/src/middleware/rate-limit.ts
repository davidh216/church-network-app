import type { Request } from 'express';
import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import { env } from '../config/env';

// Limits on login and registration attempts. "IP" is req.ip, which honours TRUST_PROXY.
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
export const registerRateLimit = rateLimit({ ...shared, limit: max, identifier: 'register-ip' });

// Login runs three limiters, in this order (each answers 429 RATE_LIMITED):

// 1. Per IP, five times the per-account limit across all emails, so one address cannot try many
//    accounts, while users behind a shared address (NAT, one office) do not lock each other out.
export const loginIpRateLimit = rateLimit({ ...shared, limit: max * 5, identifier: 'login-ip' });

// 2. Per email, whatever the IP: a backstop for when the client address cannot be trusted. The
//    Next.js rewrite passes a client-sent X-Forwarded-For through unchanged, so a client that can
//    reach Next directly could otherwise rotate forged addresses for unlimited attempts against
//    one account. Accepted cost: anyone can deliberately lock a known account out of password
//    login for the rest of a window by spending these attempts on it.
export const loginEmailRateLimit = rateLimit({
  ...shared,
  limit: max * 5,
  identifier: 'login-email',
  keyGenerator: (req) => `email|${loginEmail(req)}`,
});

// 3. Per IP and email: RATE_LIMIT_AUTH_MAX attempts.
export const loginAccountRateLimit = rateLimit({
  ...shared,
  limit: max,
  identifier: 'login-ip-email',
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${loginEmail(req)}`,
});
