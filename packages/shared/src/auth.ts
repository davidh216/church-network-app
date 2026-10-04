import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, passwordNotEmail, passwordSchema } from './password-policy';

// POST /api/auth/register
export const registerInput = z
  .object({
    email: z.email().max(254),
    password: passwordSchema,
    name: z.string().trim().min(1).max(200),
    phone: z.string().trim().max(50).optional(),
  })
  .superRefine(passwordNotEmail);

// POST /api/auth/login
export const loginInput = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

// POST /api/auth/change-password
export const changePasswordInput = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  newPassword: passwordSchema,
});

export type RegisterInput = z.input<typeof registerInput>;
export type LoginInput = z.input<typeof loginInput>;
export type ChangePasswordInput = z.input<typeof changePasswordInput>;
