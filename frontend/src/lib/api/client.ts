import type { ApiErrorBody } from '../../types/domain';

/** Window event fired when any API call returns 401; the AuthProvider listens for it. */
export const UNAUTHENTICATED_EVENT = 'embrace:unauthenticated';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: Record<string, string[]>;

  constructor(status: number, message: string, code?: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export type ApiFetchInit = RequestInit & { json?: unknown };

/**
 * The message to show for a failed response: the first field error from a
 * validation failure (`details`, as "field: message"), else `error`, else a
 * generic message with the status.
 */
function errorMessage(status: number, body: ApiErrorBody | null): string {
  if (body?.details) {
    for (const [field, messages] of Object.entries(body.details)) {
      if (messages?.[0]) return `${field}: ${messages[0]}`;
    }
  }
  return body?.error || `Request failed (${status})`;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Sends a request to the backend through the same-origin `/api` rewrite.
 * The session travels in the httpOnly `embrace_session` cookie.
 */
export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const response = await apiRequest(path, init);
  return (await readBody(response)) as T;
}

/**
 * Like `apiFetch` but returns the raw successful `Response` (for downloads).
 * Errors are handled exactly as in `apiFetch`.
 */
export async function apiRequest(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const { json, headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders);
  let body = rest.body;
  if (json !== undefined) {
    body = JSON.stringify(json);
  }
  if (body !== undefined && body !== null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api${path}`, {
    ...rest,
    body,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
    }
    const parsed = await readBody(response);
    const errorBody = parsed && typeof parsed === 'object' ? (parsed as ApiErrorBody) : null;
    throw new ApiError(
      response.status,
      errorMessage(response.status, errorBody),
      errorBody?.code,
      errorBody?.details,
    );
  }
  return response;
}
