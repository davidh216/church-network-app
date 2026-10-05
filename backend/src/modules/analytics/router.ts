import express from 'express';
import {
  engagementQuery,
  engagementTrendsQuery,
  recordActivityInput,
  recordInteractionInput,
} from '@embrace/shared';
import { validate } from '../../middleware/validate';
import { HttpError } from '../../lib/http-error';
import { idParams, jobParams, noInputQuery } from './schemas';
import * as analytics from './service';
import { getJob, startEngagementRefresh, toJobResponse } from './jobs';

// Mounted behind authenticate + requireRole(staff) in app.ts.
const router = express.Router();

router.get('/members', validate({ query: noInputQuery }), async (_req, res) => {
  res.json({ success: true, analytics: await analytics.getMemberAnalytics() });
});

// Starts the refresh-all job (or reports the one already running) and answers at once.
router.post('/members/engagement/refresh-all', validate({ query: noInputQuery }), (_req, res) => {
  const { job, started } = startEngagementRefresh();
  res.status(202).json({
    success: true,
    ...toJobResponse(job),
    message: started ? 'Engagement refresh started' : 'An engagement refresh is already running',
  });
});

router.get('/jobs/:id', validate({ params: jobParams }), (req, res) => {
  const job = getJob(req.params.id);
  if (!job) throw new HttpError(404, 'Job not found');
  res.json({ success: true, ...toJobResponse(job) });
});

router.get(
  '/members/:id/engagement',
  validate({ params: idParams, query: engagementQuery }),
  async (req, res) => {
    const { lastActivity, ...engagement } = await analytics.calculateMemberEngagement(
      req.params.id,
      req.query.types,
    );
    res.json({
      success: true,
      engagement: { ...engagement, lastActivity: lastActivity?.toISOString() ?? null },
    });
  },
);

router.post('/members/:id/engagement/refresh', validate({ params: idParams }), async (req, res) => {
  await analytics.updateMemberEngagement(req.params.id);
  res.json({ success: true, message: 'Engagement updated successfully' });
});

router.get(
  '/members/:id/trends',
  validate({ params: idParams, query: engagementTrendsQuery }),
  async (req, res) => {
    res.json({
      success: true,
      trends: await analytics.getEngagementTrends(req.params.id, req.query.months),
    });
  },
);

router.post(
  '/members/:id/activities',
  validate({ params: idParams, body: recordActivityInput }),
  async (req, res) => {
    await analytics.recordActivity(req.params.id, req.body);
    res.json({ success: true, message: 'Activity recorded successfully' });
  },
);

router.post(
  '/members/:id/interactions',
  validate({ params: idParams, body: recordInteractionInput }),
  async (req, res) => {
    await analytics.recordInteraction(req.params.id, req.user!.id, req.body);
    res.json({ success: true, message: 'Interaction recorded successfully' });
  },
);

export default router;
