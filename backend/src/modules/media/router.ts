import express from 'express';
import { createMediaInput } from '@embrace/shared';
import { requireRole, STAFF } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { idParams, listMediaQuery } from './schemas';
import * as media from './service';

const router = express.Router();

router.get('/', validate({ query: listMediaQuery }), async (req, res) => {
  res.json({ success: true, media: await media.listMedia(req.query) });
});

router.post('/', requireRole(...STAFF), validate({ body: createMediaInput }), async (req, res) => {
  res.status(201).json({ success: true, media: await media.createMedia(req.user!.id, req.body) });
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  res.json({ success: true, media: await media.getMedia(req.params.id) });
});

export default router;
