import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '../api/client';

const MAX_RETRIES = 2;

/**
 * Retries network failures and 5xx responses, never a 4xx: the request will not succeed
 * on its own (401 already signs the user out through the client).
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}

/** The app's QueryClient; one per browser tab (created once in `Providers`). */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetry, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}
