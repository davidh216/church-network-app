import express from 'express';
import { prisma } from '../lib/prisma';
import { memberAnalyticsService } from '../services/memberAnalytics';

const router = express.Router();

// Get overall member analytics for dashboard
router.get('/members', async (req, res) => {
  try {
    const analytics = await memberAnalyticsService.getMemberAnalytics();
    res.json({ success: true, analytics });
  } catch (error) {
    console.error('Error fetching member analytics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
});

// Get engagement score for a specific member
router.get('/members/:id/engagement', async (req, res) => {
  try {
    const { id } = req.params;
    const engagement = await memberAnalyticsService.calculateMemberEngagement(id);
    res.json({ success: true, engagement });
  } catch (error) {
    console.error('Error calculating member engagement:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate engagement' });
  }
});

// Update engagement score for a specific member
router.post('/members/:id/engagement/refresh', async (req, res) => {
  try {
    const { id } = req.params;
    await memberAnalyticsService.updateMemberEngagement(id);
    res.json({ success: true, message: 'Engagement updated successfully' });
  } catch (error) {
    console.error('Error updating member engagement:', error);
    res.status(500).json({ success: false, error: 'Failed to update engagement' });
  }
});

// Get engagement trends for a member
router.get('/members/:id/trends', async (req, res) => {
  try {
    const { id } = req.params;
    const { months } = req.query;
    const trends = await memberAnalyticsService.getEngagementTrends(
      id, 
      months ? parseInt(months as string) : 12
    );
    res.json({ success: true, trends });
  } catch (error) {
    console.error('Error fetching engagement trends:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch trends' });
  }
});

// Record a member activity
router.post('/members/:id/activities', async (req, res) => {
  try {
    const { id } = req.params;
    const { activityType, description, metadata, points } = req.body;
    
    await memberAnalyticsService.recordActivity(
      id,
      activityType,
      description,
      metadata,
      points || 0
    );
    
    res.json({ success: true, message: 'Activity recorded successfully' });
  } catch (error) {
    console.error('Error recording activity:', error);
    res.status(500).json({ success: false, error: 'Failed to record activity' });
  }
});

// Record a member interaction
router.post('/members/:id/interactions', async (req, res) => {
  try {
    const { id } = req.params;
    const { interactionType, channel, subject, content, metadata } = req.body;
    
    await memberAnalyticsService.recordInteraction(
      id,
      interactionType,
      channel,
      subject,
      content,
      req.user?.id, // Staff member ID from auth
      metadata
    );
    
    res.json({ success: true, message: 'Interaction recorded successfully' });
  } catch (error) {
    console.error('Error recording interaction:', error);
    res.status(500).json({ success: false, error: 'Failed to record interaction' });
  }
});

// Bulk update engagement scores for all members
router.post('/members/engagement/refresh-all', async (req, res) => {
  try {
    const members = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true }
    });

    // Update engagement for each member (this could be optimized with background jobs)
    let updated = 0;
    for (const member of members) {
      try {
        await memberAnalyticsService.updateMemberEngagement(member.id);
        updated++;
      } catch (error) {
        console.error(`Error updating engagement for member ${member.id}:`, error);
      }
    }

    res.json({ 
      success: true, 
      message: `Updated engagement scores for ${updated} out of ${members.length} members` 
    });
  } catch (error) {
    console.error('Error bulk updating engagement scores:', error);
    res.status(500).json({ success: false, error: 'Failed to update engagement scores' });
  }
});

export default router;