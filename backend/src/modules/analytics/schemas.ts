import { z } from 'zod';
import { channel, idParams, interactionType, metadata } from '../../lib/schemas';

export { idParams };

export const noInputQuery = z.object({});

export const trendsQuery = z.object({
  months: z.coerce.number().int().min(1).max(60).default(12),
});

export const recordActivityBody = z.object({
  activityType: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  metadata,
  points: z.number().int().min(-1000).max(1000).default(0),
});

export const recordInteractionBody = z.object({
  interactionType,
  channel,
  subject: z.string().trim().max(200).optional(),
  content: z.string().trim().max(10_000).optional(),
  metadata,
});
