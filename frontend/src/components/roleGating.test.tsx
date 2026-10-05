import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Home from '@/app/page';
import LoginForm from '@/components/auth/LoginForm';
import SimpleMediaLibrary from '@/components/media/SimpleMediaLibrary';
import { ApiError } from '@/lib/api/client';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { makeUser } from '@/test/fixtures';
import { buttonTexts, render, settle } from '@/test/render';
import type { Member } from '@/types/domain';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const authApi = vi.hoisted(() => ({
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => authApi);

const usersApi = vi.hoisted(() => ({ listUsers: vi.fn(), exportUsers: vi.fn() }));
vi.mock('@/lib/api/users', () => usersApi);

const mediaApi = vi.hoisted(() => ({ listMedia: vi.fn(), createMedia: vi.fn() }));
vi.mock('@/lib/api/media', () => mediaApi);

const directory: Member[] = [
  {
    id: 'm1',
    name: 'Ann Example',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    roles: [],
  },
  {
    id: 'm2',
    name: 'Bob Example',
    isActive: true,
    createdAt: '2026-01-02T00:00:00.000Z',
    roles: [],
  },
];

async function renderAs(roleNames: string[], ui: React.ReactNode) {
  authApi.me.mockResolvedValue(makeUser(roleNames));
  const { container } = await render(<AuthProvider>{ui}</AuthProvider>);
  return container;
}

beforeEach(() => {
  vi.resetAllMocks();
  usersApi.listUsers.mockResolvedValue(directory);
  mediaApi.listMedia.mockResolvedValue([]);
});

const noop = () => undefined;

// MemberList role gating lives in members/MemberList.test.tsx.

describe('SimpleMediaLibrary role gating', () => {
  it('hides Add Video from a member', async () => {
    const container = await renderAs(['member'], <SimpleMediaLibrary onPlayMedia={noop} />);
    const buttons = buttonTexts(container);
    expect(buttons).not.toContain('Add Video');
    expect(buttons).not.toContain('Add Your First Video');
  });

  it('shows Add Video to an admin', async () => {
    const container = await renderAs(['admin'], <SimpleMediaLibrary onPlayMedia={noop} />);
    expect(buttonTexts(container)).toContain('Add Video');
  });
});

describe('dashboard shell', () => {
  it('hides the analytics quick action from a member and shows the profile card', async () => {
    const container = await renderAs(['member'], <Home />);
    expect(container.textContent).toContain('Your Profile');
    expect(buttonTexts(container).some((b) => b.includes('Member Analytics'))).toBe(false);
  });

  it('shows the analytics quick action to staff', async () => {
    const container = await renderAs(['admin'], <Home />);
    expect(buttonTexts(container).some((b) => b.includes('Member Analytics'))).toBe(true);
  });

  it('shows "The server is unavailable" when me() fails; Retry asks again', async () => {
    authApi.me.mockRejectedValueOnce(new TypeError('fetch failed'));
    authApi.me.mockRejectedValueOnce(new ApiError(502, 'Bad Gateway'));
    authApi.me.mockResolvedValueOnce(makeUser(['member']));
    const { container } = await render(
      <AuthProvider>
        <Home />
      </AuthProvider>,
    );
    const retry = () =>
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Retry');
    expect(container.textContent).toContain('The server is unavailable');
    expect(container.textContent).not.toContain('signed out');
    expect(retry()).toBeDefined();

    await act(async () => retry()?.click());
    await settle();
    expect(authApi.me).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('The server is unavailable');

    await act(async () => retry()?.click());
    await settle();
    expect(authApi.me).toHaveBeenCalledTimes(3);
    expect(container.textContent).not.toContain('The server is unavailable');
    expect(container.textContent).toContain('Your Profile');
  });

  it('Logout calls the API and routes to /login', async () => {
    authApi.logout.mockResolvedValue(undefined);
    const container = await renderAs(['member'], <Home />);
    const logout = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Logout',
    );
    await act(async () => logout?.click());
    await settle();
    expect(authApi.logout).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/login');
  });
});

describe('LoginForm', () => {
  it('signs in through the AuthProvider and reports the user', async () => {
    authApi.me.mockRejectedValue(new Error('401'));
    const signedIn = makeUser(['member'], { name: 'Ann' });
    authApi.login.mockResolvedValue(signedIn);
    const onSuccess = vi.fn();
    const rendered = await render(
      <AuthProvider>
        <LoginForm onSuccess={onSuccess} onSwitchToRegister={noop} />
      </AuthProvider>,
    );
    const { container } = rendered;
    const setValue = (selector: string, value: string) => {
      const input = container.querySelector<HTMLInputElement>(selector)!;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    await act(async () => {
      setValue('#email', 'ann@example.com');
      setValue('#password', 'a long enough password');
    });
    await act(async () => {
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await settle();
    expect(authApi.login).toHaveBeenCalledWith('ann@example.com', 'a long enough password');
    expect(onSuccess).toHaveBeenCalledWith(signedIn);
  });
});
