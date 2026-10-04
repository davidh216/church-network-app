import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';

// Per-IP limit on login and registration attempts (one shared counter for both routes).
// Off under NODE_ENV=test unless the test sets RATE_LIMIT_AUTH_MAX.
export const authRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_AUTH_WINDOW_MINUTES * 60 * 1000,
  limit: env.RATE_LIMIT_AUTH_MAX ?? 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test' && env.RATE_LIMIT_AUTH_MAX === undefined,
  message: { error: 'Too many attempts. Please try again later.', code: 'RATE_LIMITED' },
});
