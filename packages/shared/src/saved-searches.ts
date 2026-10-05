import { z } from 'zod';
import { boundedText, requiredText } from './primitives.js';
import { searchQuery } from './search.js';

// POST /api/users/saved-searches. The stored query is exactly a `searchQuery`; it is validated
// again on load and returned with `invalid: true` when it no longer matches the schema.
export const createSavedSearchInput = z.object({
  name: requiredText('Name', 200),
  description: boundedText('Description', 1000).optional(),
  query: searchQuery,
  isPublic: z.boolean({ error: 'Shared must be true or false' }).optional(),
});

export type CreateSavedSearchInput = z.input<typeof createSavedSearchInput>;
