import express from 'express';
import jwt from 'jsonwebtoken';
import { changePasswordInput, loginInput, registerInput } from '@embrace/shared';
import { authenticate, SESSION_COOKIE, sessionCookieOptions } from '../../middleware/auth';
import {
  loginAccountRateLimit,
  loginEmailRateLimit,
  loginIpRateLimit,
  registerRateLimit,
} from '../../middleware/rate-limit';
import { validate } from '../../middleware/validate';
import * as auth from './service';

const router = express.Router();

// The same 201 body whether the email was new or already registered (no email enumeration).
router.post('/register', registerRateLimit, validate({ body: registerInput }), async (req, res) => {
  await auth.register(req.body);
  res.status(201).json({
    success: true,
    pendingApproval: true,
    message: 'Account created. A church administrator must approve it before you can sign in.',
  });
});

// Sets the session cookie; the token itself is never put in the response body.
router.post(
  '/login',
  loginIpRateLimit,
  loginEmailRateLimit,
  loginAccountRateLimit,
  validate({ body: loginInput }),
  async (req, res) => {
    const { user, token } = await auth.login(req.body);
    // The cookie lives exactly as long as the token (JWT_EXPIRES_IN).
    const { exp, iat } = jwt.decode(token) as jwt.JwtPayload;
    res.cookie(SESSION_COOKIE, token, {
      ...sessionCookieOptions(),
      maxAge: ((exp ?? 0) - (iat ?? 0)) * 1000,
    });
    res.json({ success: true, user });
  },
);

// Logout CSRF: a cross-site form post does not carry the SameSite=Lax cookie, but the browser
// would still apply the clearing Set-Cookie. Browsers send Sec-Fetch-Site; requests without it
// (curl, scripts, older browsers) are allowed.
router.post('/logout', (req, res) => {
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    res.status(403).json({ error: 'Forbidden', code: 'CROSS_SITE' });
    return;
  }
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.status(204).end();
});

// req.user is loaded with selfSelect by `authenticate`.
router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, user: req.user });
});

router.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordInput }),
  async (req, res) => {
    await auth.changePassword(req.user!.id, req.body);
    res.json({ success: true, message: 'Password changed. Please sign in again.' });
  },
);

export default router;
