import { z } from 'zod';
import { searchQuery } from './search.js';

// POST /api/users/saved-searches. The stored query is exactly a `searchQuery`; it is validated
// again on load and returned with `invalid: true` when it no longer matches the schema.
export const createSavedSearchInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  query: searchQuery,
  isPublic: z.boolean().optional(),
});

export type CreateSavedSearchInput = z.input<typeof createSavedSearchInput>;
