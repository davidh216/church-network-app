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
