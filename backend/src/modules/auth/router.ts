import express from 'express';
import jwt from 'jsonwebtoken';
import { authenticate, SESSION_COOKIE, sessionCookieOptions } from '../../middleware/auth';
import { authRateLimit } from '../../middleware/rate-limit';
import { validate } from '../../middleware/validate';
import { changePasswordBody, loginBody, registerBody } from './schemas';
import * as auth from './service';

const router = express.Router();

// The same 201 body whether the email was new or already registered (no email enumeration).
router.post('/register', authRateLimit, validate({ body: registerBody }), async (req, res) => {
  await auth.register(req.body);
  res.status(201).json({
    success: true,
    pendingApproval: true,
    message: 'Account created. A church administrator must approve it before you can sign in.',
  });
});

// Sets the session cookie; the token itself is never put in the response body.
router.post('/login', authRateLimit, validate({ body: loginBody }), async (req, res) => {
  const { user, token } = await auth.login(req.body);
  // The cookie lives exactly as long as the token (JWT_EXPIRES_IN).
  const { exp, iat } = jwt.decode(token) as jwt.JwtPayload;
  res.cookie(SESSION_COOKIE, token, {
    ...sessionCookieOptions(),
    maxAge: ((exp ?? 0) - (iat ?? 0)) * 1000,
  });
  res.json({ success: true, user });
});

router.post('/logout', (_req, res) => {
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
  validate({ body: changePasswordBody }),
  async (req, res) => {
    await auth.changePassword(req.user!.id, req.body);
    res.json({ success: true, message: 'Password changed. Please sign in again.' });
  },
);

export default router;
