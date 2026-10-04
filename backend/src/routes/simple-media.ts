import express from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireRole, STAFF } from '../middleware/auth';

const router = express.Router();

// Get all media with filtering
router.get('/', async (req, res) => {
  try {
    const { type, tag, search, limit = '20' } = req.query;
    
    const whereClause: Prisma.MediaWhereInput = {
      isPublic: true,
      isApproved: true,
    };

    if (type) {
      whereClause.type = String(type);
    }

    if (search) {
      whereClause.OR = [
        { title: { contains: search as string } },
        { description: { contains: search as string } },
      ];
    }

    if (tag && tag !== 'all') {
      whereClause.tags = { contains: tag as string };
    }

    const media = await prisma.media.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      include: {
        uploadedBy: {
          select: { id: true, name: true }
        }
      }
    });

    res.json({ success: true, media });
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch media' });
  }
});

// Add media manually
router.post('/', requireRole(...STAFF), async (req, res) => {
  try {
    const user = req.user!;

    const { title, description, type, url, tags = [] } = req.body;

    if (!title || !type || !url) {
      return res.status(400).json({ 
        success: false, 
        error: 'Title, type, and URL are required' 
      });
    }

    // Validate YouTube URL
    if (type === 'YOUTUBE_VIDEO') {
      const youtubePattern = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/;
      if (!youtubePattern.test(url)) {
        return res.status(400).json({
          success: false,
          error: 'Please provide a valid YouTube URL'
        });
      }
    }

    const media = await prisma.media.create({
      data: {
        title,
        description: description || '',
        type,
        url,
        tags: JSON.stringify(tags),
        isApproved: true,
        isPublic: true,
        uploadedById: user.id,
      },
      include: {
        uploadedBy: {
          select: { id: true, name: true }
        }
      }
    });

    res.status(201).json({ success: true, media });
  } catch (error) {
    console.error('Error creating media:', error);
    res.status(500).json({ success: false, error: 'Failed to create media' });
  }
});

// Get media by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const media = await prisma.media.findUnique({
      where: { id },
      include: {
        uploadedBy: {
          select: { id: true, name: true }
        }
      }
    });

    if (!media) {
      return res.status(404).json({ success: false, error: 'Media not found' });
    }

    res.json({ success: true, media });
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch media' });
  }
});

export default router;