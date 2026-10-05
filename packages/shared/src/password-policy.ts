import { z } from 'zod';
import { COMMON_PASSWORDS } from './common-passwords.js';

// Password rules for registration, staff-created accounts and password changes.
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

const COMMON = new Set(COMMON_PASSWORDS);

export function isCommonPassword(password: string): boolean {
  return COMMON.has(password.toLowerCase());
}

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`)
  .refine((password) => !isCommonPassword(password), 'This password is too common');

export const PASSWORD_MATCHES_EMAIL =
  'Password must not be the same as the name part of the email address';

export function matchesEmailLocalPart(password: string, email: string): boolean {
  return password.toLowerCase() === email.slice(0, email.lastIndexOf('@')).toLowerCase();
}

// Refinement for bodies that carry both `email` and `password` (register, staff create).
export function passwordNotEmail(
  body: { email: string; password: string },
  ctx: z.RefinementCtx,
): void {
  if (matchesEmailLocalPart(body.password, body.email)) {
    ctx.addIssue({ code: 'custom', path: ['password'], message: PASSWORD_MATCHES_EMAIL });
  }
}
