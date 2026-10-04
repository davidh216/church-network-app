import { z } from 'zod';
import { cuid } from '@embrace/shared';
import { idParams } from '../../lib/schemas';

export { idParams };

export const listUsersQuery = z.object({});

export const exportQuery = z.object({
  format: z.enum(['csv', 'json']).default('csv'),
  // Comma-separated member ids; without it every active member is exported.
  members: z
    .string()
    .max(10_000)
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    )
    .pipe(z.array(cuid).max(1000).optional()),
});
