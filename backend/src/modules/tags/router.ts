import express from 'express';
import { createTagInput, listTagsQuery, updateTagInput } from '@embrace/shared';
import { requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { idParams } from '../../lib/schemas';
import * as tags from './service';

// Mounted behind authenticate + requireRole(staff) in app.ts; deleting a tag is admin-only.
// Assigning tags to members lives under /api/users/:id/tags (users router).
const router = express.Router();

router.get('/', validate({ query: listTagsQuery }), async (req, res) => {
  res.json({ success: true, tags: await tags.listTags(req.query) });
});

router.post('/', validate({ body: createTagInput }), async (req, res) => {
  res.status(201).json({ success: true, tag: await tags.createTag(req.user!, req.body) });
});

router.patch('/:id', validate({ params: idParams, body: updateTagInput }), async (req, res) => {
  res.json({ success: true, tag: await tags.updateTag(req.user!, req.params.id, req.body) });
});

router.delete('/:id', requireRole('admin'), validate({ params: idParams }), async (req, res) => {
  res.json({ success: true, ...(await tags.deleteTag(req.user!, req.params.id)) });
});

export default router;
