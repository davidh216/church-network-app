import express from 'express';
import {
  createFamilyInput,
  listFamiliesQuery,
  putFamilyMemberInput,
  setFamilyRelationshipInput,
  updateFamilyInput,
} from '@embrace/shared';
import { requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { idParams } from '../../lib/schemas';
import { familyMemberParams, familyRelationshipParams } from './schemas';
import * as families from './service';
import * as membership from './membership';

// GET /api/families/mine, open to every signed-in user: their own family, names only. Mounted
// before requireRole(staff) in app.ts.
export const ownFamilyRoutes = express.Router();

ownFamilyRoutes.get('/mine', async (req, res) => {
  res.json({ success: true, family: await families.ownFamily(req.user!.id) });
});

// Mounted behind authenticate + requireRole(staff) in app.ts (PHASE5_SPECS.md 1.2); deleting a
// family is admin-only.
const router = express.Router();

router.get('/', validate({ query: listFamiliesQuery }), async (req, res) => {
  res.json({ success: true, ...(await families.listFamilies(req.query)) });
});

router.post('/', validate({ body: createFamilyInput }), async (req, res) => {
  res.status(201).json({ success: true, family: await families.createFamily(req.user!, req.body) });
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  res.json({ success: true, family: await families.getFamily(req.params.id) });
});

router.patch('/:id', validate({ params: idParams, body: updateFamilyInput }), async (req, res) => {
  res.json({
    success: true,
    family: await families.updateFamily(req.user!, req.params.id, req.body),
  });
});

router.delete('/:id', requireRole('admin'), validate({ params: idParams }), async (req, res) => {
  res.json({ success: true, ...(await families.deleteFamily(req.user!, req.params.id)) });
});

router.put(
  '/:id/members/:userId',
  validate({ params: familyMemberParams, body: putFamilyMemberInput }),
  async (req, res) => {
    const { id, userId } = req.params;
    const move = req.body?.move === true;
    res.json({ success: true, ...(await membership.putMember(req.user!, id, userId, move)) });
  },
);

router.delete(
  '/:id/members/:userId',
  validate({ params: familyMemberParams }),
  async (req, res) => {
    const { id, userId } = req.params;
    res.json({ success: true, ...(await membership.removeMember(req.user!, id, userId)) });
  },
);

router.put(
  '/:id/relationships',
  validate({ params: idParams, body: setFamilyRelationshipInput }),
  async (req, res) => {
    res.json({
      success: true,
      relationship: await membership.setRelationship(req.user!, req.params.id, req.body),
    });
  },
);

router.delete(
  '/:id/relationships/:relationshipId',
  validate({ params: familyRelationshipParams }),
  async (req, res) => {
    const { id, relationshipId } = req.params;
    await membership.removeRelationship(req.user!, id, relationshipId);
    res.json({ success: true });
  },
);

export default router;
