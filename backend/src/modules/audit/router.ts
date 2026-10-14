import express from 'express';
import { listAuditQuery } from '@embrace/shared';
import { validate } from '../../middleware/validate';
import * as auditLog from './service';

// Mounted behind authenticate + requireRole('admin') in app.ts.
const router = express.Router();

router.get('/', validate({ query: listAuditQuery }), async (req, res) => {
  res.json({ success: true, ...(await auditLog.listAudit(req.query)) });
});

export default router;
