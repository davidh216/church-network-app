import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, UNAUTHENTICATED_EVENT } from '@/lib/api/client';
import { makeUser } from '@/test/fixtures';
import { render, settle } from '@/test/render';
import {
  AuthProvider,
  useAuth,
  useHasRole,
  useIsStaff,
  type AuthContextValue,
} from './AuthProvider';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const api = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn() }));
vi.mock('@/lib/api/auth', () => api);

let auth: AuthContextValue;
let flags: { staff: boolean; leader: boolean };

function Probe() {
  auth = useAuth();
  flags = { staff: useIsStaff(), leader: useHasRole('leader') };
  return (
    <p data-testid="status">
      {auth.status}:{auth.user?.name ?? 'none'}
    </p>
  );
}

async function mount(path = '/') {
  window.history.replaceState(null, '', path);
  const rendered = await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  return rendered.container;
}

beforeEach(() => {
  vi.resetAllMocks();
  api.logout.mockResolvedValue(undefined);
});

describe('AuthProvider', () => {
  it('starts loading, then becomes authenticated from me()', async () => {
    let resolveMe: (user: ReturnType<typeof makeUser>) => void = () => undefined;
    api.me.mockReturnValue(new Promise((resolve) => (resolveMe = resolve)));
    const container = await mount();
    expect(container.textContent).toBe('loading:none');

    await act(async () => resolveMe(makeUser(['admin'], { name: 'Ada' })));
    expect(container.textContent).toBe('authenticated:Ada');
    expect(flags).toEqual({ staff: true, leader: false });
  });

  it('is anonymous when me() fails with 401', async () => {
    api.me.mockRejectedValue(new ApiError(401, 'Unauthorized'));
    const container = await mount('/login');
    expect(container.textContent).toBe('anonymous:none');
    expect(flags).toEqual({ staff: false, leader: false });
  });

  it('is anonymous when me() fails with 403', async () => {
    api.me.mockRejectedValue(new ApiError(403, 'Forbidden'));
    const container = await mount('/login');
    expect(container.textContent).toBe('anonymous:none');
  });

  it('is in error, not anonymous, when me() fails with a 5xx', async () => {
    api.me.mockRejectedValue(new ApiError(502, 'Bad Gateway'));
    const container = await mount();
    expect(container.textContent).toBe('error:none');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('is in error when the API cannot be reached', async () => {
    api.me.mockRejectedValue(new TypeError('fetch failed'));
    const container = await mount();
    expect(container.textContent).toBe('error:none');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('keeps the user through a failed refresh() and recovers on the next one', async () => {
    api.me.mockResolvedValueOnce(makeUser(['leader'], { name: 'Kept' }));
    const container = await mount();
    expect(container.textContent).toBe('authenticated:Kept');

    api.me.mockRejectedValueOnce(new ApiError(503, 'Service Unavailable'));
    await act(async () => {
      await auth.refresh();
    });
    expect(container.textContent).toBe('error:Kept');
    expect(flags).toEqual({ staff: true, leader: true });

    api.me.mockResolvedValueOnce(makeUser(['leader'], { name: 'Kept' }));
    await act(async () => {
      await auth.refresh();
    });
    expect(container.textContent).toBe('authenticated:Kept');
    expect(api.me).toHaveBeenCalledTimes(3);
  });

  it('login() stores the user; logout() calls the API and routes to /login', async () => {
    api.me.mockRejectedValue(new ApiError(401, 'Unauthorized'));
    api.login.mockResolvedValue(makeUser(['leader'], { name: 'Lee' }));
    const container = await mount('/login');

    await act(async () => {
      await auth.login('lee@example.com', 'correct horse battery');
    });
    expect(api.login).toHaveBeenCalledWith('lee@example.com', 'correct horse battery');
    expect(container.textContent).toBe('authenticated:Lee');
    expect(flags).toEqual({ staff: true, leader: true });

    await act(async () => {
      await auth.logout();
    });
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/login');
    expect(container.textContent).toBe('anonymous:none');
  });

  it('still signs out locally when the logout request fails', async () => {
    api.me.mockResolvedValue(makeUser(['member']));
    api.logout.mockRejectedValue(new ApiError(500, 'boom'));
    const container = await mount();
    await act(async () => {
      await auth.logout();
    });
    expect(container.textContent).toBe('anonymous:none');
    expect(router.replace).toHaveBeenCalledWith('/login');
  });

  it('refresh() reloads the user from me()', async () => {
    api.me.mockResolvedValueOnce(makeUser(['member'], { name: 'Old' }));
    const container = await mount();
    api.me.mockResolvedValueOnce(makeUser(['member'], { name: 'New' }));
    await act(async () => {
      await auth.refresh();
    });
    expect(container.textContent).toBe('authenticated:New');
  });

  it('on embrace:unauthenticated clears the user, clears the cookie and routes to /login?next=', async () => {
    api.me.mockResolvedValue(makeUser(['member'], { name: 'Mo' }));
    const container = await mount('/members?page=2');
    expect(container.textContent).toBe('authenticated:Mo');

    await act(async () => {
      window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
    });
    await settle();
    expect(container.textContent).toBe('anonymous:none');
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/login?next=%2Fmembers%3Fpage%3D2');
  });

  it('does not redirect on embrace:unauthenticated while on a public page', async () => {
    api.me.mockRejectedValue(new ApiError(401, 'Unauthorized'));
    await mount('/register');
    await act(async () => {
      window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
    });
    await settle();
    expect(api.logout).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('useAuth throws outside the provider', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(render(<Probe />)).rejects.toThrow('useAuth must be used inside <AuthProvider>');
    spy.mockRestore();
  });
});
