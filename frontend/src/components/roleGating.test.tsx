import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginForm from '@/components/auth/LoginForm';
import SimpleMediaLibrary from '@/components/media/SimpleMediaLibrary';
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

// The dashboard shell's role gating lives in layout/AppShell.test.tsx.

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
