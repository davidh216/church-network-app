import { z } from 'zod';
import { channel, interactionType } from './enums.js';
import { boundedText, metadata, requiredText } from './primitives.js';

const POINTS_MESSAGE = 'Points must be a whole number from -1000 to 1000';

// POST /api/analytics/members/:id/activities (staff)
export const recordActivityInput = z.object({
  activityType: requiredText('Activity type', 100),
  description: boundedText('Description', 1000).optional(),
  metadata,
  points: z
    .number({ error: POINTS_MESSAGE })
    .int(POINTS_MESSAGE)
    .min(-1000, POINTS_MESSAGE)
    .max(1000, POINTS_MESSAGE)
    .default(0),
});

// POST /api/analytics/members/:id/interactions (staff)
export const recordInteractionInput = z.object({
  interactionType,
  channel,
  subject: boundedText('Subject', 200).optional(),
  content: boundedText('Content', 10_000).optional(),
  metadata,
});

export type RecordActivityInput = z.input<typeof recordActivityInput>;
export type RecordInteractionInput = z.input<typeof recordInteractionInput>;
