import express from 'express';
import { prisma } from '../lib/prisma';

const router = express.Router();

router.get('/', async (_req, res) => {
  const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });
  res.json({ success: true, roles });
});

export default router;
