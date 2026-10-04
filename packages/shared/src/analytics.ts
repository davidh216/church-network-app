import { z } from 'zod';
import { channel, interactionType } from './enums';
import { metadata } from './primitives';

// POST /api/analytics/members/:id/activities (staff)
export const recordActivityInput = z.object({
  activityType: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  metadata,
  points: z.number().int().min(-1000).max(1000).default(0),
});

// POST /api/analytics/members/:id/interactions (staff)
export const recordInteractionInput = z.object({
  interactionType,
  channel,
  subject: z.string().trim().max(200).optional(),
  content: z.string().trim().max(10_000).optional(),
  metadata,
});

export type RecordActivityInput = z.input<typeof recordActivityInput>;
export type RecordInteractionInput = z.input<typeof recordInteractionInput>;
