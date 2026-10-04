import { z } from 'zod';
import { cuid, idParams, optionalText } from '../../lib/schemas';

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

const roleIds = z.array(cuid).max(10);

export const createUserBody = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(254),
  password: z.string().min(8).max(128),
  phone: optionalText(50),
  bio: optionalText(2000),
  isActive: z.boolean().optional(),
  roleIds: roleIds.optional(),
});

export const updateUserBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: optionalText(50),
  bio: optionalText(2000),
  isActive: z.boolean().optional(),
  roleIds: roleIds.optional(),
});
