import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/client';
import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { makeUser } from '@/test/fixtures';
import { settle } from '@/test/render';
import { makeQueryClient, shouldRetry } from './client';
import QueryCacheReset from './QueryCacheReset';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const authApi = vi.hoisted(() => ({
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => authApi);

describe('shouldRetry', () => {
  it('never retries a 4xx and retries network errors and 5xx twice', () => {
    expect(shouldRetry(0, new ApiError(401, 'x'))).toBe(false);
    expect(shouldRetry(0, new ApiError(404, 'x'))).toBe(false);
    expect(shouldRetry(0, new ApiError(503, 'x'))).toBe(true);
    expect(shouldRetry(1, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(2, new ApiError(500, 'x'))).toBe(false);
  });

  it('is the default for queries; mutations never retry', () => {
    const options = makeQueryClient().getDefaultOptions();
    expect(options.queries?.retry).toBe(shouldRetry);
    expect(options.mutations?.retry).toBe(false);
  });
});

/** Hands the provider's logout to the test. */
function AuthContextProbe({ onReady }: { onReady: (logout: () => Promise<void>) => void }) {
  onReady(useAuth().logout);
  return null;
}

describe('QueryCacheReset', () => {
  it('clears cached queries when the user signs out, not on the first sign-in', async () => {
    authApi.me.mockResolvedValue(makeUser(['admin']));
    authApi.logout.mockResolvedValue(undefined);
    const client = makeQueryClient();
    client.setQueryData(['users', 'summary'], { total: 3 });
    let logout: () => Promise<void> = async () => undefined;
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <QueryCacheReset />
          <AuthContextProbe onReady={(fn) => (logout = fn)} />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await settle();
    expect(client.getQueryData(['users', 'summary'])).toEqual({ total: 3 });
    await act(async () => logout());
    expect(client.getQueryData(['users', 'summary'])).toBeUndefined();
  });
});
