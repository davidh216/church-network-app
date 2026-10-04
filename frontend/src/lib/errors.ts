export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}

interface ApiErrorBody {
  error?: string;
  details?: Record<string, string[] | undefined>;
}

/**
 * The message to show for a failed API response: the first field error from a
 * validation failure (`details`, as "field: message"), else `error`, else `fallback`.
 */
export async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body.details) {
      for (const [field, messages] of Object.entries(body.details)) {
        if (messages?.[0]) return `${field}: ${messages[0]}`;
      }
    }
    return body.error || fallback;
  } catch {
    return fallback;
  }
}
