import express from 'express';
import {
  createServiceInput,
  listServicesQuery,
  markAttendanceInput,
  updateServiceInput,
} from '@embrace/shared';
import { requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { idParams } from '../../lib/schemas';
import * as services from './service';

// Mounted behind authenticate + requireRole(staff) in app.ts; deleting a service is admin-only.
const router = express.Router();

router.get('/', validate({ query: listServicesQuery }), async (req, res) => {
  res.json({ success: true, ...(await services.listServices(req.query)) });
});

router.post('/', validate({ body: createServiceInput }), async (req, res) => {
  res
    .status(201)
    .json({ success: true, service: await services.createService(req.user!.id, req.body) });
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  res.json({ success: true, service: await services.getService(req.params.id) });
});

router.put('/:id', validate({ params: idParams, body: updateServiceInput }), async (req, res) => {
  res.json({ success: true, service: await services.updateService(req.params.id, req.body) });
});

router.delete('/:id', requireRole('admin'), validate({ params: idParams }), async (req, res) => {
  await services.deleteService(req.params.id);
  res.json({ success: true });
});

router.get('/:id/attendance', validate({ params: idParams }), async (req, res) => {
  res.json({ success: true, ...(await services.getServiceAttendance(req.params.id)) });
});

router.put(
  '/:id/attendance',
  validate({ params: idParams, body: markAttendanceInput }),
  async (req, res) => {
    res.json({
      success: true,
      ...(await services.markAttendance(req.params.id, req.user!.id, req.body)),
    });
  },
);

export default router;
