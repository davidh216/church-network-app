import { z } from 'zod';
import { passwordNotEmail, passwordSchema } from './password-policy';
import { cuid, optionalText } from './primitives';

const roleIds = z.array(cuid).max(10);

// POST /api/users (staff)
export const createUserInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.email().max(254),
    password: passwordSchema,
    phone: optionalText(50),
    bio: optionalText(2000),
    isActive: z.boolean().optional(),
    roleIds: roleIds.optional(),
  })
  .superRefine(passwordNotEmail);

// PUT /api/users/:id
export const updateUserInput = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: optionalText(50),
  bio: optionalText(2000),
  isActive: z.boolean().optional(),
  roleIds: roleIds.optional(),
});

// POST /api/users/:id/reset-password (staff)
export const resetPasswordInput = z.object({
  newPassword: passwordSchema,
});

export type CreateUserInput = z.input<typeof createUserInput>;
export type UpdateUserInput = z.input<typeof updateUserInput>;
export type ResetPasswordInput = z.input<typeof resetPasswordInput>;
