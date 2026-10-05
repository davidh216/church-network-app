import { PASSWORD_MATCHES_EMAIL, matchesEmailLocalPart } from '@embrace/shared';
import { fieldError } from './http-error';

// The password rules themselves (length, common passwords, email local part) live in @embrace/shared.

// For a new password checked against an existing account's email; reported under `field`.
export function assertPasswordNotEmail(password: string, email: string, field: string): void {
  if (matchesEmailLocalPart(password, email)) throw fieldError(field, PASSWORD_MATCHES_EMAIL);
}
