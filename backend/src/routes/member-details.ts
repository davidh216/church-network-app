import express from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isAdmin } from '../middleware/auth';

const router = express.Router();

// Private notes are visible only to their author and to admins.
function visibleNotes(req: express.Request): Prisma.MemberNoteWhereInput {
  const user = req.user!;
  return isAdmin(user) ? {} : { OR: [{ isPrivate: false }, { authorId: user.id }] };
}

// Get comprehensive member details with Phase 3 data
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: true
          }
        },
        engagement: true,
        family: true,
        familyRelationships: {
          include: {
            relatedUser: {
              select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                avatar: true,
                isActive: true
              }
            }
          }
        },
        relatedFamilyMembers: {
          include: {
            primaryUser: {
              select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                avatar: true,
                isActive: true
              }
            }
          }
        },
        interactions: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 50
        },
        milestones: {
          orderBy: {
            achievedDate: 'desc'
          },
          take: 20
        },
        memberNotes: {
          where: visibleNotes(req),
          orderBy: {
            createdAt: 'desc'
          },
          take: 20
        },
        timelineActivities: {
          orderBy: {
            activityDate: 'desc'
          },
          take: 100
        },
        memberTags: {
          include: {
            tag: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Transform family relationships for easier consumption
    const familyMembers = [
      ...user.familyRelationships.map(rel => ({
        id: rel.relatedUser.id,
        name: rel.relatedUser.name,
        firstName: rel.relatedUser.firstName,
        lastName: rel.relatedUser.lastName,
        avatar: rel.relatedUser.avatar,
        isActive: rel.relatedUser.isActive,
        relationshipType: rel.relationshipType,
        isPrimary: true
      })),
      ...user.relatedFamilyMembers.map(rel => ({
        id: rel.primaryUser.id,
        name: rel.primaryUser.name,
        firstName: rel.primaryUser.firstName,
        lastName: rel.primaryUser.lastName,
        avatar: rel.primaryUser.avatar,
        isActive: rel.primaryUser.isActive,
        relationshipType: rel.relationshipType,
        isPrimary: false
      }))
    ];

    // Remove duplicates and sort by relationship type
    const uniqueFamilyMembers = familyMembers.filter((member, index, self) => 
      index === self.findIndex(m => m.id === member.id)
    );

    res.json({
      success: true,
      user: {
        ...user,
        familyMembers: uniqueFamilyMembers
      }
    });
  } catch (error) {
    console.error('Get member details error:', error);
    res.status(500).json({ error: 'Failed to get member details' });
  }
});

// Get member timeline activities
router.get('/:id/timeline', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const activities = await prisma.timelineActivity.findMany({
      where: { userId: id },
      orderBy: {
        activityDate: 'desc'
      },
      take: Number(limit),
      skip: Number(offset)
    });

    res.json({
      success: true,
      activities
    });
  } catch (error) {
    console.error('Get timeline error:', error);
    res.status(500).json({ error: 'Failed to get timeline' });
  }
});

// Get member interactions
router.get('/:id/interactions', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0, category } = req.query;
    
    const whereClause: Prisma.MemberInteractionWhereInput = { userId: id };
    if (category) {
      whereClause.category = String(category);
    }
    
    const interactions = await prisma.memberInteraction.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc'
      },
      take: Number(limit),
      skip: Number(offset)
    });

    res.json({
      success: true,
      interactions
    });
  } catch (error) {
    console.error('Get interactions error:', error);
    res.status(500).json({ error: 'Failed to get interactions' });
  }
});

// Get member milestones
router.get('/:id/milestones', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 20, offset = 0, category } = req.query;
    
    const whereClause: Prisma.MemberMilestoneWhereInput = { userId: id };
    if (category) {
      whereClause.category = String(category);
    }
    
    const milestones = await prisma.memberMilestone.findMany({
      where: whereClause,
      orderBy: {
        achievedDate: 'desc'
      },
      take: Number(limit),
      skip: Number(offset)
    });

    res.json({
      success: true,
      milestones
    });
  } catch (error) {
    console.error('Get milestones error:', error);
    res.status(500).json({ error: 'Failed to get milestones' });
  }
});

// Get member notes
router.get('/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 20, offset = 0, noteType } = req.query;
    
    const whereClause: Prisma.MemberNoteWhereInput = { AND: [{ userId: id }, visibleNotes(req)] };
    if (noteType) {
      whereClause.noteType = String(noteType);
    }
    
    const notes = await prisma.memberNote.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc'
      },
      take: Number(limit),
      skip: Number(offset)
    });

    res.json({
      success: true,
      notes
    });
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ error: 'Failed to get notes' });
  }
});

// Add a new interaction
router.post('/:id/interactions', async (req, res) => {
  try {
    const { id } = req.params;
    const { interactionType, subject, content, channel, category, priority, responseRequired } = req.body;
    
    const interaction = await prisma.memberInteraction.create({
      data: {
        userId: id,
        interactionType,
        subject,
        content,
        channel,
        category,
        priority: priority || 'normal',
        responseRequired: responseRequired || false,
        status: 'completed',
        completedAt: new Date()
      }
    });

    res.json({
      success: true,
      interaction
    });
  } catch (error) {
    console.error('Add interaction error:', error);
    res.status(500).json({ error: 'Failed to add interaction' });
  }
});

// Add a new milestone
router.post('/:id/milestones', async (req, res) => {
  try {
    const { id } = req.params;
    const { milestoneType, title, description, achievedDate, category, impact } = req.body;
    
    const milestone = await prisma.memberMilestone.create({
      data: {
        userId: id,
        milestoneType,
        title,
        description,
        achievedDate: new Date(achievedDate),
        category: category || 'general',
        impact: impact || 'medium'
      }
    });

    res.json({
      success: true,
      milestone
    });
  } catch (error) {
    console.error('Add milestone error:', error);
    res.status(500).json({ error: 'Failed to add milestone' });
  }
});

// Add a new note
router.post('/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, noteType, isPrivate, isFollowUp, followUpDate } = req.body;
    
    const note = await prisma.memberNote.create({
      data: {
        userId: id,
        authorId: req.user!.id,
        title,
        content,
        noteType: noteType || 'general',
        isPrivate: isPrivate || false,
        isFollowUp: isFollowUp || false,
        followUpDate: followUpDate ? new Date(followUpDate) : null
      }
    });

    res.json({
      success: true,
      note
    });
  } catch (error) {
    console.error('Add note error:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

export default router; 