import express from 'express';
import { validate } from '../../middleware/validate';
import { createSavedSearchBody, idParams, listSavedSearchesQuery } from './schemas';
import * as savedSearches from './service';

// Mounted by the users router at /api/users/saved-searches.
const router = express.Router();

router.get('/', validate({ query: listSavedSearchesQuery }), async (req, res) => {
  res.json({ success: true, searches: await savedSearches.listSavedSearches(req.user!.id) });
});

router.post('/', validate({ body: createSavedSearchBody }), async (req, res) => {
  const search = await savedSearches.createSavedSearch(req.user!.id, req.body);
  res.status(201).json({ success: true, message: 'Search saved successfully', search });
});

router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  await savedSearches.deleteSavedSearch(req.user!, req.params.id);
  res.json({ success: true, message: 'Search deleted successfully' });
});

router.post('/:id/use', validate({ params: idParams }), async (req, res) => {
  await savedSearches.useSavedSearch(req.user!, req.params.id);
  res.json({ success: true, message: 'Usage tracked' });
});

export default router;
