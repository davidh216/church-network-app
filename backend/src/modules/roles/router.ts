import express from 'express';
import { validate } from '../../middleware/validate';
import { listRolesQuery } from './schemas';
import { listRoles } from './service';

const router = express.Router();

router.get('/', validate({ query: listRolesQuery }), async (_req, res) => {
  res.json({ success: true, roles: await listRoles() });
});

export default router;
