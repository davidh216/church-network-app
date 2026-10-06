import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OwnProfile from '@/components/members/OwnProfile';
import { ApiError } from '@/lib/api/client';
import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { makeUser } from '@/test/fixtures';
import { render, settle } from '@/test/render';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const authApi = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), logout: vi.fn() }));
vi.mock('@/lib/api/auth', () => authApi);

const usersApi = vi.hoisted(() => ({ updateUser: vi.fn() }));
vi.mock('@/lib/api/users', () => usersApi);

const detailsApi = vi.hoisted(() => ({ getOwnAttendance: vi.fn() }));
vi.mock('@/lib/api/memberDetails', () => detailsApi);

const stored = makeUser(['member'], { volunteerSkills: ['Music'], interests: ['Hiking'] });

// The route renders OwnProfile with the signed-in user from the auth context.
function Own() {
  const { user } = useAuth();
  return user ? <OwnProfile user={user} /> : null;
}

async function open() {
  await render(
    <AuthProvider>
      <Own />
    </AuthProvider>,
  );
}

const save = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Save skills and interests' }));
  await settle();
};
// The form's own status line (each chip field also has a polite status region).
const status = () =>
  within(screen.getByRole('region', { name: 'Skills and Interests' }))
    .getAllByRole('status')
    .at(-1);

beforeEach(() => {
  vi.resetAllMocks();
  authApi.me.mockResolvedValue(stored);
  detailsApi.getOwnAttendance.mockReturnValue(new Promise(() => undefined));
});

describe('OwnProfile skills and interests', () => {
  it('shows the member their own lists as chips', async () => {
    await open();
    expect(screen.getByRole('list', { name: 'Volunteer Skills' })).toHaveTextContent('Music');
    expect(screen.getByRole('list', { name: 'Interests' })).toHaveTextContent('Hiking');
  });

  it('saves only the changed list to their own account and reloads the signed-in user', async () => {
    usersApi.updateUser.mockResolvedValue({ ...stored, volunteerSkills: ['Music', 'Sound desk'] });
    await open();
    const skills = screen.getByRole('textbox', { name: 'Volunteer Skills' });
    fireEvent.change(skills, { target: { value: 'Sound desk' } });
    fireEvent.keyDown(skills, { key: 'Enter' });
    authApi.me.mockResolvedValue({ ...stored, volunteerSkills: ['Music', 'Sound desk'] });
    await save();
    expect(usersApi.updateUser).toHaveBeenCalledWith(stored.id, {
      volunteerSkills: ['Music', 'Sound desk'],
    });
    expect(authApi.me).toHaveBeenCalledTimes(2);
    expect(status()).toHaveTextContent('Your skills and interests were saved.');
    expect(screen.getByRole('button', { name: 'Remove Sound desk' })).toBeInTheDocument();
  });

  it('sends nothing when nothing changed', async () => {
    await open();
    await save();
    expect(usersApi.updateUser).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent('No changes to save.');
  });

  it('shows an API error on the list and a general error as an alert', async () => {
    usersApi.updateUser.mockRejectedValueOnce(
      new ApiError(400, 'Validation failed', 'VALIDATION', {
        interests: ['Interests cannot be blank'],
      }),
    );
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Hiking' }));
    await save();
    expect(screen.getByRole('textbox', { name: 'Interests' })).toHaveAccessibleDescription(
      /Interests cannot be blank/,
    );
    usersApi.updateUser.mockRejectedValueOnce(new ApiError(500, 'Server error'));
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent('Server error');
    expect(status()).toHaveTextContent('');
  });
});
