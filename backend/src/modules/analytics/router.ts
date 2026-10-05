import express from 'express';
import { validate } from '../../middleware/validate';
import {
  idParams,
  noInputQuery,
  recordActivityBody,
  recordInteractionBody,
  trendsQuery,
} from './schemas';
import * as analytics from './service';

// Mounted behind authenticate + requireRole(staff) in app.ts.
const router = express.Router();

router.get('/members', validate({ query: noInputQuery }), async (_req, res) => {
  res.json({ success: true, analytics: await analytics.getMemberAnalytics() });
});

router.post(
  '/members/engagement/refresh-all',
  validate({ query: noInputQuery }),
  async (_req, res) => {
    const { updated, total } = await analytics.refreshAllEngagement();
    res.json({
      success: true,
      message: `Updated engagement scores for ${updated} out of ${total} members`,
    });
  },
);

router.get('/members/:id/engagement', validate({ params: idParams }), async (req, res) => {
  res.json({ success: true, engagement: await analytics.calculateMemberEngagement(req.params.id) });
});

router.post('/members/:id/engagement/refresh', validate({ params: idParams }), async (req, res) => {
  await analytics.updateMemberEngagement(req.params.id);
  res.json({ success: true, message: 'Engagement updated successfully' });
});

router.get(
  '/members/:id/trends',
  validate({ params: idParams, query: trendsQuery }),
  async (req, res) => {
    res.json({
      success: true,
      trends: await analytics.getEngagementTrends(req.params.id, req.query.months),
    });
  },
);

router.post(
  '/members/:id/activities',
  validate({ params: idParams, body: recordActivityBody }),
  async (req, res) => {
    await analytics.recordActivity(req.params.id, req.body);
    res.json({ success: true, message: 'Activity recorded successfully' });
  },
);

router.post(
  '/members/:id/interactions',
  validate({ params: idParams, body: recordInteractionBody }),
  async (req, res) => {
    await analytics.recordInteraction(req.params.id, req.user!.id, req.body);
    res.json({ success: true, message: 'Interaction recorded successfully' });
  },
);

export default router;
