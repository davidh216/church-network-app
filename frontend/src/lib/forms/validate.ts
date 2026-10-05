import type { z } from 'zod';
import { isApiError } from '../api/client';
import { getErrorMessage } from '../errors';

/** The first error message for each top-level field; `_form` holds errors about the whole form. */
export type FieldErrors = Partial<Record<string, string>>;

export const FORM_ERROR_KEY = '_form';

export type FormValidation<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

/**
 * Collects zod issues the way the API's validate middleware does (flattened by the first path
 * segment, messages unchanged), keeping only the first message per field for inline display.
 */
export function issuesToFieldErrors(issues: z.ZodError['issues']): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const head = issue.path[0];
    const key = head === undefined ? FORM_ERROR_KEY : String(head);
    errors[key] ??= issue.message;
  }
  return errors;
}

/**
 * Validates form values with a shared `@embrace/shared` schema, so the client applies the same
 * rules and messages as the API. On success `data` is the schema output (trimmed, blanks as null,
 * canonical URLs), which is what the form sends.
 */
export function validateForm<S extends z.ZodType>(
  schema: S,
  values: unknown,
): FormValidation<z.output<S>> {
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, errors: issuesToFieldErrors(result.error.issues) };
}

/**
 * Splits a failed save into inline errors for the form's own fields and a message for the rest.
 * An API 400 VALIDATION whose details all name shown fields becomes inline errors only; any other
 * failure (or a detail about a field the form does not show) keeps the general message.
 */
export function apiErrorsFor(
  err: unknown,
  shownFields: readonly string[],
  fallback: string,
): { fieldErrors: FieldErrors; message: string } {
  const fieldErrors: FieldErrors = {};
  let unshown = !isApiError(err) || !err.details;
  if (isApiError(err) && err.details) {
    for (const [field, messages] of Object.entries(err.details)) {
      if (!messages?.[0]) continue;
      if (shownFields.includes(field)) fieldErrors[field] = messages[0];
      else unshown = true;
    }
  }
  return { fieldErrors, message: unshown ? getErrorMessage(err, fallback) : '' };
}

/** The id of a field's inline error message. */
export function errorId(fieldId: string): string {
  return `${fieldId}-error`;
}

/** ARIA props that tie a control to its inline error, if it has one. */
export function fieldA11y(
  fieldId: string,
  error: string | undefined,
): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  return error ? { 'aria-invalid': true, 'aria-describedby': errorId(fieldId) } : {};
}
