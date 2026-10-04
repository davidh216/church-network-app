import { z } from 'zod';
import { mediaType } from '@embrace/shared';
import { idParams, pagination } from '../../lib/schemas';

export { idParams };

export const listMediaQuery = z.object({
  type: mediaType.optional(),
  tag: z.string().trim().max(100).optional(),
  search: z.string().trim().max(200).optional(),
  limit: pagination(20).limit,
});
