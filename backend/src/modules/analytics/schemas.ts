import { z } from 'zod';
import { idParams } from '../../lib/schemas';

export { idParams };

export const noInputQuery = z.object({});

export const trendsQuery = z.object({
  months: z.coerce.number().int().min(1).max(60).default(12),
});
