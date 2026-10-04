import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Home from '@/app/page';
import LoginForm from '@/components/auth/LoginForm';
import SimpleMediaLibrary from '@/components/media/SimpleMediaLibrary';
import MemberList from '@/components/members/MemberList';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { makeUser } from '@/test/fixtures';
import { buttonTexts, render, settle, type Rendered } from '@/test/render';
import type { Member } from '@/types/domain';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const authApi = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn() }));
vi.mock('@/lib/api/auth', () => authApi);

const usersApi = vi.hoisted(() => ({ listUsers: vi.fn(), exportUsers: vi.fn() }));
vi.mock('@/lib/api/users', () => usersApi);

const mediaApi = vi.hoisted(() => ({ listMedia: vi.fn(), createMedia: vi.fn() }));
vi.mock('@/lib/api/media', () => mediaApi);

const directory: Member[] = [
  { id: 'm1', name: 'Ann Example', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', roles: [] },
  { id: 'm2', name: 'Bob Example', isActive: true, createdAt: '2026-01-02T00:00:00.000Z', roles: [] },
];

let rendered: Rendered | undefined;
async function renderAs(roleNames: string[], ui: React.ReactNode) {
  authApi.me.mockResolvedValue(makeUser(roleNames));
  rendered = await render(<AuthProvider>{ui}</AuthProvider>);
  return rendered.container;
}

beforeEach(() => {
  vi.resetAllMocks();
  usersApi.listUsers.mockResolvedValue(directory);
  mediaApi.listMedia.mockResolvedValue([]);
});

afterEach(() => {
  rendered?.unmount();
  rendered = undefined;
});

const noop = () => undefined;

describe('MemberList role gating', () => {
  it('hides Add Member, View, Edit and selection from a member', async () => {
    const container = await renderAs(['member'], (
      <MemberList onEditMember={noop} onAddMember={noop} refreshTrigger={0} />
    ));
    expect(container.textContent).toContain('Ann Example');
    const buttons = buttonTexts(container);
    expect(buttons).not.toContain('Add Member');
    expect(buttons).not.toContain('View');
    expect(buttons).not.toContain('Edit');
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(container.textContent).not.toContain('Actions');
  });

  it('shows the staff controls, and Export after selecting, to a leader', async () => {
    const container = await renderAs(['leader'], (
      <MemberList onEditMember={noop} onAddMember={noop} refreshTrigger={0} />
    ));
    const buttons = buttonTexts(container);
    expect(buttons).toContain('Add Member');
    expect(buttons.filter((b) => b === 'View')).toHaveLength(2);
    expect(buttons.filter((b) => b === 'Edit')).toHaveLength(2);

    const rowCheckbox = container.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')[0];
    await act(async () => rowCheckbox?.click());
    expect(buttonTexts(container)).toContain('Export Selected (1)');
  });
});

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

  it('Logout calls the API and routes to /login', async () => {
    authApi.logout.mockResolvedValue(undefined);
    const container = await renderAs(['member'], <Home />);
    const logout = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Logout');
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
    rendered = await render(
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
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await settle();
    expect(authApi.login).toHaveBeenCalledWith('ann@example.com', 'a long enough password');
    expect(onSuccess).toHaveBeenCalledWith(signedIn);
  });
});
