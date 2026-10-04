import express from 'express';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { loginBody, registerBody } from './schemas';
import * as auth from './service';

const router = express.Router();

router.post('/register', validate({ body: registerBody }), async (req, res) => {
  const user = await auth.register(req.body);
  res.status(201).json({
    success: true,
    pendingApproval: true,
    message: 'Account created. A church administrator must approve it before you can sign in.',
    user,
  });
});

router.post('/login', validate({ body: loginBody }), async (req, res) => {
  const { user, token } = await auth.login(req.body);
  res.json({ success: true, user, token });
});

// req.user is loaded with selfSelect by `authenticate`.
router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, user: req.user });
});

export default router;
