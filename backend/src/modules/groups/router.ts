import express from 'express';
import {
  addGroupMemberInput,
  createGroupInput,
  listGroupsQuery,
  updateGroupInput,
  updateGroupMemberInput,
} from '@embrace/shared';
import { isStaff, requireRole, STAFF } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { HttpError } from '../../lib/http-error';
import { idParams } from '../../lib/schemas';
import { groupMemberParams } from './schemas';
import * as groups from './service';

// Mounted behind authenticate in app.ts (PHASE5_SPECS.md 1.2). Reading the directory is open to
// every signed-in user, who get the member or the staff shape; every write is staff-only, and
// deleting a group is admin-only.
const router = express.Router();
const staffOnly = requireRole(...STAFF);

router.get('/', validate({ query: listGroupsQuery }), async (req, res) => {
  const staff = isStaff(req.user!);
  const query = req.query;
  if (query.mine) {
    const memberships = await groups.ownMemberships(req.user!.id, staff, query);
    res.json({ success: true, memberships });
    return;
  }
  if (!staff && query.status !== undefined)
    throw new HttpError(403, 'Only staff can filter by status');
  res.json({ success: true, groups: await groups.listGroups(staff, query) });
});

router.post('/', staffOnly, validate({ body: createGroupInput }), async (req, res) => {
  res.status(201).json({ success: true, group: await groups.createGroup(req.user!, req.body) });
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  res.json({ success: true, group: await groups.getGroup(req.params.id, isStaff(req.user!)) });
});

router.patch(
  '/:id',
  staffOnly,
  validate({ params: idParams, body: updateGroupInput }),
  async (req, res) => {
    res.json({
      success: true,
      group: await groups.updateGroup(req.user!, req.params.id, req.body),
    });
  },
);

router.delete('/:id', requireRole('admin'), validate({ params: idParams }), async (req, res) => {
  res.json({ success: true, ...(await groups.deleteGroup(req.user!, req.params.id)) });
});

router.post(
  '/:id/members',
  staffOnly,
  validate({ params: idParams, body: addGroupMemberInput }),
  async (req, res) => {
    const member = await groups.addMember(req.user!, req.params.id, req.body);
    res.status(201).json({ success: true, member });
  },
);

router.patch(
  '/:id/members/:userId',
  staffOnly,
  validate({ params: groupMemberParams, body: updateGroupMemberInput }),
  async (req, res) => {
    const { id, userId } = req.params;
    res.json({
      success: true,
      member: await groups.updateMember(req.user!, id, userId, req.body),
    });
  },
);

router.delete(
  '/:id/members/:userId',
  staffOnly,
  validate({ params: groupMemberParams }),
  async (req, res) => {
    await groups.removeMember(req.user!, req.params.id, req.params.userId);
    res.json({ success: true });
  },
);

export default router;
