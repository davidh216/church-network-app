import { z } from 'zod';
import { passwordNotEmail, passwordSchema } from './password-policy.js';
import { cuid, emailAddress, optionalText, requiredText } from './primitives.js';

const roleIds = z.array(cuid).max(10, 'Choose at most 10 roles');

// POST /api/users (staff)
export const createUserInput = z
  .object({
    name: requiredText('Name', 200),
    email: emailAddress,
    password: passwordSchema,
    phone: optionalText('Phone', 50),
    bio: optionalText('Bio', 2000),
    isActive: z.boolean({ error: 'Status must be true or false' }).optional(),
    roleIds: roleIds.optional(),
  })
  .superRefine(passwordNotEmail);

// PUT /api/users/:id
export const updateUserInput = z.object({
  name: requiredText('Name', 200).optional(),
  phone: optionalText('Phone', 50),
  bio: optionalText('Bio', 2000),
  isActive: z.boolean({ error: 'Status must be true or false' }).optional(),
  roleIds: roleIds.optional(),
});

// POST /api/users/:id/reset-password (staff)
export const resetPasswordInput = z.object({
  newPassword: passwordSchema,
});

export type CreateUserInput = z.input<typeof createUserInput>;
export type UpdateUserInput = z.input<typeof updateUserInput>;
export type ResetPasswordInput = z.input<typeof resetPasswordInput>;
