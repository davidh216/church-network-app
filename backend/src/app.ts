import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { corsOrigins } from './config/env';
import { prisma } from './lib/prisma';
import { authenticate, requireRole, STAFF } from './middleware/auth';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import rolesRoutes from './routes/roles';
import mediaRoutes from './routes/simple-media';
import analyticsRoutes from './routes/analytics';
import memberDetailsRoutes from './routes/member-details';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'OK', message: 'Church app backend is running', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'DEGRADED', message: 'Database unavailable', timestamp: new Date().toISOString() });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', authenticate, usersRoutes);
  app.use('/api/roles', authenticate, rolesRoutes);
  app.use('/api/media', authenticate, mediaRoutes);
  // CRM data (notes, interactions, milestones, engagement) is staff-only.
  app.use('/api/analytics', authenticate, requireRole(...STAFF), analyticsRoutes);
  app.use('/api/member-details', authenticate, requireRole(...STAFF), memberDetailsRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Malformed JSON body' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  return app;
}
