import express from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { isAdmin } from '../middleware/auth';
import { parseOr400, idParam } from '../lib/validation';

const router = express.Router();

function parseQuery(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

router.get('/', async (req, res) => {
  const user = req.user!;
  const searches = await prisma.savedSearch.findMany({
    where: { OR: [{ createdBy: user.id }, { isPublic: true }] },
    orderBy: [{ lastUsed: 'desc' }, { createdAt: 'desc' }],
  });
  res.json({
    success: true,
    searches: searches.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      query: parseQuery(s.query),
      isPublic: s.isPublic,
      createdAt: s.createdAt,
      usageCount: s.usageCount,
      lastUsed: s.lastUsed,
    })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  query: z.unknown().refine((q) => q !== undefined && q !== null, 'query is required'),
  isPublic: z.boolean().optional(),
});

router.post('/', async (req, res) => {
  const body = parseOr400(createSchema, req.body, res);
  if (!body) return;
  const user = req.user!;
  const saved = await prisma.savedSearch.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      query: JSON.stringify(body.query),
      isPublic: body.isPublic ?? false,
      createdBy: user.id,
    },
  });
  res.status(201).json({
    success: true,
    message: 'Search saved successfully',
    search: {
      id: saved.id,
      name: saved.name,
      description: saved.description,
      query: body.query,
      isPublic: saved.isPublic,
      createdAt: saved.createdAt,
    },
  });
});

router.delete('/:id', async (req, res) => {
  const params = parseOr400(idParam, req.params, res);
  if (!params) return;
  const user = req.user!;
  const search = await prisma.savedSearch.findUnique({ where: { id: params.id } });
  if (!search) {
    res.status(404).json({ error: 'Search not found' });
    return;
  }
  if (search.createdBy !== user.id && !isAdmin(user)) {
    res.status(403).json({ error: 'Not authorized to delete this search' });
    return;
  }
  await prisma.savedSearch.delete({ where: { id: params.id } });
  res.json({ success: true, message: 'Search deleted successfully' });
});

router.post('/:id/use', async (req, res) => {
  const params = parseOr400(idParam, req.params, res);
  if (!params) return;
  const user = req.user!;
  const search = await prisma.savedSearch.findUnique({ where: { id: params.id } });
  if (!search || (search.createdBy !== user.id && !search.isPublic)) {
    res.status(404).json({ error: 'Search not found' });
    return;
  }
  await prisma.savedSearch.update({
    where: { id: params.id },
    data: { usageCount: { increment: 1 }, lastUsed: new Date() },
  });
  res.json({ success: true, message: 'Usage tracked' });
});

export default router;
