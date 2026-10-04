import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { corsOrigins } from './config/env';
import { prisma } from './lib/prisma';
import { requestLogger } from './lib/request-logger';
import { authenticate, requireRole, STAFF } from './middleware/auth';
import { errorHandler } from './middleware/error-handler';
import { notFound } from './middleware/not-found';
import authRoutes from './modules/auth/router';
import usersRoutes from './modules/users/router';
import rolesRoutes from './modules/roles/router';
import mediaRoutes from './modules/media/router';
import analyticsRoutes from './modules/analytics/router';
import memberDetailsRoutes from './modules/member-details/router';

// package.json sits one level above both src/ (tsx) and dist/ (node).
const { version } = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string };

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(helmet());
  // Content-Disposition is exposed so the browser can read the export's filename.
  app.use(cors({ origin: corsOrigins, credentials: true, exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/health', async (_req, res) => {
    const info = { version, uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() };
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'OK', message: 'Church app backend is running', ...info });
    } catch {
      res.status(503).json({ status: 'DEGRADED', message: 'Database unavailable', ...info });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', authenticate, usersRoutes);
  app.use('/api/roles', authenticate, rolesRoutes);
  app.use('/api/media', authenticate, mediaRoutes);
  // CRM data (notes, interactions, milestones, engagement) is staff-only.
  app.use('/api/analytics', authenticate, requireRole(...STAFF), analyticsRoutes);
  app.use('/api/member-details', authenticate, requireRole(...STAFF), memberDetailsRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
