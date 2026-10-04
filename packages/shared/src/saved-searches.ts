import { z } from 'zod';

// POST /api/users/saved-searches
export const createSavedSearchInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  // The advanced-search query; item S3 narrows this to `searchQuery`.
  query: z.unknown().refine((q) => q !== undefined && q !== null, 'query is required'),
  isPublic: z.boolean().optional(),
});

export type CreateSavedSearchInput = z.input<typeof createSavedSearchInput>;
