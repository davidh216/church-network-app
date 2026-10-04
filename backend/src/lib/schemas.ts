import { z } from 'zod';
import { cuid } from '@embrace/shared';

// Route-local building blocks. The request body schemas and the enums live in @embrace/shared.

export const idParams = z.object({ id: cuid });

// Pagination for list endpoints: coerced from the query string, at most 100 rows per page.
export const pagination = (defaultLimit: number) => ({
  limit: z.coerce.number().int().min(1).max(100).default(defaultLimit),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
