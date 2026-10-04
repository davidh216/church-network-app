import { z } from 'zod';
import { passwordNotEmail, passwordSchema } from '../../lib/password-policy';

export const registerBody = z
  .object({
    email: z.email().max(254),
    password: passwordSchema,
    name: z.string().trim().min(1).max(200),
    phone: z.string().trim().max(50).optional(),
  })
  .superRefine(passwordNotEmail);

export const loginBody = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
