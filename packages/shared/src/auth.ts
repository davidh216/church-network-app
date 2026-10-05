import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, passwordNotEmail, passwordSchema } from './password-policy.js';
import { boundedText, emailAddress, requiredText, tooLong } from './primitives.js';

// POST /api/auth/register
export const registerInput = z
  .object({
    email: emailAddress,
    password: passwordSchema,
    name: requiredText('Name', 200),
    phone: boundedText('Phone', 50).optional(),
  })
  .superRefine(passwordNotEmail);

// A password the user types to prove who they are (not checked against the policy).
const enteredPassword = (required: string) =>
  z
    .string({ error: required })
    .min(1, required)
    .max(MAX_PASSWORD_LENGTH, tooLong('Password', MAX_PASSWORD_LENGTH));

// POST /api/auth/login
export const loginInput = z.object({
  email: emailAddress,
  password: enteredPassword('Enter your password'),
});

// POST /api/auth/change-password
export const changePasswordInput = z.object({
  currentPassword: enteredPassword('Enter your current password'),
  newPassword: passwordSchema,
});

export type RegisterInput = z.input<typeof registerInput>;
export type LoginInput = z.input<typeof loginInput>;
export type ChangePasswordInput = z.input<typeof changePasswordInput>;
