import express from 'express';
import { isAdmin, isStaff, requireRole, STAFF } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { HttpError } from '../../lib/http-error';
import savedSearchRoutes from '../saved-searches/router';
import {
  createUserBody,
  exportQuery,
  idParams,
  listUsersQuery,
  resetPasswordBody,
  updateUserBody,
} from './schemas';
import * as users from './service';

const router = express.Router();

// Saved searches live under /api/users/saved-searches and must be mounted before /:id.
router.use('/saved-searches', savedSearchRoutes);

router.get('/', validate({ query: listUsersQuery }), async (req, res) => {
  res.json({ success: true, users: await users.listUsers(isStaff(req.user!)) });
});

router.get('/export', requireRole(...STAFF), validate({ query: exportQuery }), async (req, res) => {
  const rows = await users.exportRows(req.query.members);
  if (req.query.format === 'json') {
    res.json({ success: true, data: rows });
    return;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="members.csv"');
  res.send(users.toCsv(rows));
});

router.post('/', requireRole(...STAFF), validate({ body: createUserBody }), async (req, res) => {
  const user = await users.createUser(req.user!, req.body);
  res.status(201).json({ success: true, user });
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  const requester = req.user!;
  const full = isStaff(requester) || requester.id === req.params.id;
  res.json({ success: true, user: await users.getUser(req.params.id, full) });
});

// Members edit their own name/phone/bio. Staff may also activate/deactivate members.
// Only admins change roles; the service applies the rules that depend on the target account.
router.put('/:id', validate({ params: idParams, body: updateUserBody }), async (req, res) => {
  const requester = req.user!;
  const staff = isStaff(requester);
  if (!staff && requester.id !== req.params.id)
    throw new HttpError(403, 'Can only update your own profile');
  if (req.body.isActive !== undefined && !staff)
    throw new HttpError(403, 'Only staff can change account status');
  if (req.body.roleIds !== undefined && !isAdmin(requester))
    throw new HttpError(403, 'Only an admin can change roles');
  res.json({ success: true, user: await users.updateUser(requester, req.params.id, req.body) });
});

// An admin sets a new password for any account. Existing sessions (stateless JWTs) stay valid
// until they expire.
router.post(
  '/:id/reset-password',
  requireRole('admin'),
  validate({ params: idParams, body: resetPasswordBody }),
  async (req, res) => {
    await users.resetPassword(req.params.id, req.body.newPassword);
    res.json({ success: true, message: 'Password reset.' });
  },
);

export default router;
