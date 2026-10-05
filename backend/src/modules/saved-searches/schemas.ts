import { z } from 'zod';
import { idParams } from '../../lib/schemas';

export { idParams };

export const listSavedSearchesQuery = z.object({});

export const createSavedSearchBody = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  // The advanced-search query tree; stored as JSON text until Phase 2 defines its shape.
  query: z.unknown().refine((q) => q !== undefined && q !== null, 'query is required'),
  isPublic: z.boolean().optional(),
});
