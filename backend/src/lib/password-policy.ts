import { z } from 'zod';
import { COMMON_PASSWORDS } from './common-passwords';
import { fieldError } from './http-error';

// Password rules for registration, staff-created accounts and password changes.
const COMMON = new Set(COMMON_PASSWORDS);

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((password) => !COMMON.has(password.toLowerCase()), 'This password is too common');

const MATCHES_EMAIL = 'Password must not be the same as the name part of the email address';

function matchesEmailLocalPart(password: string, email: string): boolean {
  return password.toLowerCase() === email.slice(0, email.lastIndexOf('@')).toLowerCase();
}

// Refinement for bodies that carry both `email` and `password` (register, staff create).
export function passwordNotEmail(
  body: { email: string; password: string },
  ctx: z.RefinementCtx,
): void {
  if (matchesEmailLocalPart(body.password, body.email)) {
    ctx.addIssue({ code: 'custom', path: ['password'], message: MATCHES_EMAIL });
  }
}

// For a new password checked against an existing account's email; reported under `field`.
export function assertPasswordNotEmail(password: string, email: string, field: string): void {
  if (matchesEmailLocalPart(password, email)) throw fieldError(field, MATCHES_EMAIL);
}
