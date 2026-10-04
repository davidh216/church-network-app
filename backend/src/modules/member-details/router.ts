import express from 'express';
import { addInteractionInput, addMilestoneInput, addNoteInput } from '@embrace/shared';
import { validate } from '../../middleware/validate';
import {
  detailsQuery,
  idParams,
  interactionsQuery,
  milestonesQuery,
  notesQuery,
  timelineQuery,
} from './schemas';
import * as details from './service';

// Mounted behind authenticate + requireRole(staff) in app.ts.
const router = express.Router();

router.get('/:id', validate({ params: idParams, query: detailsQuery }), async (req, res) => {
  res.json({ success: true, user: await details.getMemberDetails(req.params.id, req.user!) });
});

router.get(
  '/:id/timeline',
  validate({ params: idParams, query: timelineQuery }),
  async (req, res) => {
    res.json({ success: true, activities: await details.listTimeline(req.params.id, req.query) });
  },
);

router.get(
  '/:id/interactions',
  validate({ params: idParams, query: interactionsQuery }),
  async (req, res) => {
    res.json({
      success: true,
      interactions: await details.listInteractions(req.params.id, req.query),
    });
  },
);

router.get(
  '/:id/milestones',
  validate({ params: idParams, query: milestonesQuery }),
  async (req, res) => {
    res.json({ success: true, milestones: await details.listMilestones(req.params.id, req.query) });
  },
);

router.get('/:id/notes', validate({ params: idParams, query: notesQuery }), async (req, res) => {
  res.json({ success: true, notes: await details.listNotes(req.params.id, req.user!, req.query) });
});

router.post(
  '/:id/interactions',
  validate({ params: idParams, body: addInteractionInput }),
  async (req, res) => {
    res.json({ success: true, interaction: await details.addInteraction(req.params.id, req.body) });
  },
);

router.post(
  '/:id/milestones',
  validate({ params: idParams, body: addMilestoneInput }),
  async (req, res) => {
    res.json({ success: true, milestone: await details.addMilestone(req.params.id, req.body) });
  },
);

router.post('/:id/notes', validate({ params: idParams, body: addNoteInput }), async (req, res) => {
  res.json({ success: true, note: await details.addNote(req.params.id, req.user!.id, req.body) });
});

export default router;
