import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GroupsPage from '@/components/groups/GroupsPage';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { makeUser } from '@/test/fixtures';
import { render, settle } from '@/test/render';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const authApi = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), logout: vi.fn() }));
vi.mock('@/lib/api/auth', () => authApi);
const groupsApi = vi.hoisted(() => ({
  listGroups: vi.fn(),
  listOwnGroups: vi.fn(),
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
}));
vi.mock('@/lib/api/groups', () => groupsApi);

const choir = {
  id: 'g1',
  name: 'Choir',
  type: 'ministry' as const,
  description: null,
  meetingDay: 'Wednesdays',
  meetingTime: '19:30',
  location: 'Hall',
  leaders: [{ name: 'Ann', role: 'leader' as const }],
};
const staffChoir = {
  ...choir,
  isActive: true,
  memberCount: 4,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

async function renderAs(roles: string[]) {
  authApi.me.mockResolvedValue(makeUser(roles));
  return render(
    <AuthProvider>
      <GroupsPage />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  groupsApi.listOwnGroups.mockResolvedValue([]);
});

describe('GroupsPage', () => {
  it('shows members the directory and their own groups, without staff controls', async () => {
    groupsApi.listGroups.mockResolvedValue([choir]);
    groupsApi.listOwnGroups.mockResolvedValue([
      { group: choir, role: 'co_leader', joinDate: '2026-01-01T00:00:00.000Z' },
    ]);
    await renderAs(['member']);
    const directory = screen.getByRole('region', { name: 'Directory' });
    expect(within(directory).getByRole('link', { name: 'Choir' })).toHaveAttribute(
      'href',
      '/groups/g1',
    );
    expect(directory).toHaveTextContent('Wednesdays at 19:30 · Hall');
    expect(directory).toHaveTextContent('Led by Ann (Leader)');
    expect(directory).not.toHaveTextContent('members');
    expect(screen.getByRole('region', { name: 'My groups' })).toHaveTextContent('Co-leader');
    expect(screen.queryByRole('button', { name: 'New Group' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
    expect(groupsApi.listGroups).toHaveBeenCalledWith({}, expect.anything());
  });

  it('gives staff filters, member counts and archiving', async () => {
    groupsApi.listGroups.mockResolvedValue([staffChoir]);
    groupsApi.updateGroup.mockResolvedValue({ ...staffChoir, isActive: false });
    await renderAs(['leader']);
    expect(screen.getByRole('region', { name: 'Directory' })).toHaveTextContent('4 members');
    expect(screen.getByText('You are not in any group yet.')).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'all' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), {
      target: { value: 'committee' },
    });
    await settle();
    expect(groupsApi.listGroups).toHaveBeenLastCalledWith(
      { type: 'committee', status: 'all' },
      expect.anything(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Archive Choir' }));
    await settle();
    expect(groupsApi.updateGroup).toHaveBeenCalledWith('g1', { isActive: false });
  });

  it('creates a group from the dialog and opens it', async () => {
    groupsApi.listGroups.mockResolvedValue([]);
    groupsApi.createGroup.mockResolvedValue({ ...staffChoir, id: 'g9' });
    await renderAs(['admin']);
    expect(screen.getByText('No groups to show.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New Group' }));
    const dialog = screen.getByRole('dialog', { name: 'New Group' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Group' }));
    await settle();
    expect(within(dialog).getByRole('textbox', { name: 'Name *' })).toHaveAccessibleDescription(
      /Name is required/,
    );
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name *' }), {
      target: { value: ' Choir ' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Meeting day' }), {
      target: { value: 'Wednesdays' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Group' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/groups/g9'));
    expect(groupsApi.createGroup).toHaveBeenCalledWith({
      name: 'Choir',
      type: 'small_group',
      description: null,
      meetingDay: 'Wednesdays',
      meetingTime: null,
      location: null,
    });
  });
});
