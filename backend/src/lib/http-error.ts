import { z } from 'zod';

// An error a service or router throws to end the request with a specific 4xx status.
// The error handler turns it into the `{ error, code? }` body of the shared error contract.
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

// A 400 VALIDATION error for one field, for rules a schema cannot check on its own
// (they need the database). The error handler reports it like any other zod failure.
export function fieldError(field: string, message: string): z.ZodError {
  return new z.ZodError([{ code: 'custom', path: [field], message, input: undefined }]);
}
