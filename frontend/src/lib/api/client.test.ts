import { describe, expect, it, vi } from 'vitest';
import { ApiError, UNAUTHENTICATED_EVENT, apiFetch, apiRequest, isApiError } from './client';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function mockFetch(response: Response) {
  const fn = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

function lastCall(fn: ReturnType<typeof mockFetch>): {
  url: string;
  init: RequestInit;
  headers: Headers;
} {
  const [url, init = {}] = fn.mock.calls[0] ?? [];
  return { url: String(url), init, headers: new Headers(init.headers) };
}

describe('apiFetch', () => {
  it('calls the relative /api path with credentials and parses JSON', async () => {
    const fetchMock = mockFetch(jsonResponse({ success: true, users: [] }));
    const data = await apiFetch<{ success: boolean; users: unknown[] }>('/users');

    expect(data).toEqual({ success: true, users: [] });
    const { url, init, headers } = lastCall(fetchMock);
    expect(url).toBe('/api/users');
    expect(init.credentials).toBe('include');
    expect(headers.has('Content-Type')).toBe(false);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('serialises `json` and sets Content-Type only when there is a body', async () => {
    const fetchMock = mockFetch(jsonResponse({ success: true }, 201));
    await apiFetch('/users', { method: 'POST', json: { name: 'Ann', roleIds: ['r1'] } });

    const { init, headers } = lastCall(fetchMock);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'Ann', roleIds: ['r1'] }));
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init).not.toHaveProperty('json');
  });

  it('does not set Content-Type for a bodiless POST', async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }));
    const result = await apiFetch('/auth/logout', { method: 'POST' });

    expect(result).toBeNull();
    expect(lastCall(fetchMock).headers.has('Content-Type')).toBe(false);
  });

  it('throws an ApiError with status, code, details and the first field message', async () => {
    mockFetch(
      jsonResponse(
        { error: 'Validation failed', code: 'VALIDATION', details: { email: ['Invalid email'] } },
        400,
      ),
    );

    const err: unknown = await apiFetch('/users', { method: 'POST', json: {} }).catch(
      (e: unknown) => e,
    );

    expect(isApiError(err)).toBe(true);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      code: 'VALIDATION',
      message: 'email: Invalid email',
      details: { email: ['Invalid email'] },
    });
  });

  it('uses `error` as the message, or a status fallback for non-JSON bodies', async () => {
    mockFetch(jsonResponse({ error: 'Not found' }, 404));
    await expect(apiFetch('/users/x')).rejects.toMatchObject({ status: 404, message: 'Not found' });

    mockFetch(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(apiFetch('/users')).rejects.toMatchObject({
      status: 502,
      message: 'Request failed (502)',
    });
  });

  it('dispatches embrace:unauthenticated on 401 and still throws', async () => {
    mockFetch(jsonResponse({ error: 'Authentication required' }, 401));
    const listener = vi.fn();
    window.addEventListener(UNAUTHENTICATED_EVENT, listener);
    try {
      await expect(apiFetch('/auth/me')).rejects.toMatchObject({ status: 401 });
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(UNAUTHENTICATED_EVENT, listener);
    }
  });

  it('does not dispatch the unauthenticated event for other errors', async () => {
    mockFetch(jsonResponse({ error: 'Forbidden' }, 403));
    const listener = vi.fn();
    window.addEventListener(UNAUTHENTICATED_EVENT, listener);
    try {
      await expect(apiFetch('/analytics/members')).rejects.toMatchObject({ status: 403 });
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(UNAUTHENTICATED_EVENT, listener);
    }
  });

  it('never reads or writes web storage (the session is an httpOnly cookie)', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    mockFetch(jsonResponse({ success: true, user: { id: 'u1' } }));
    await apiFetch('/auth/login', { method: 'POST', json: { email: 'a@b.c', password: 'x' } });

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('apiRequest', () => {
  it('returns the raw response on success', async () => {
    mockFetch(new Response('a,b\n1,2', { status: 200, headers: { 'Content-Type': 'text/csv' } }));
    const response = await apiRequest('/users/export?format=csv');
    expect(await response.text()).toBe('a,b\n1,2');
  });
});

describe('isApiError', () => {
  it('is false for plain errors and non-errors', () => {
    expect(isApiError(new Error('x'))).toBe(false);
    expect(isApiError({ status: 400, message: 'x' })).toBe(false);
  });
});
