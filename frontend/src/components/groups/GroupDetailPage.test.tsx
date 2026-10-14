import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GroupDetailPage from '@/components/groups/GroupDetailPage';
import { ApiError } from '@/lib/api/client';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { makeUser } from '@/test/fixtures';
import { render, settle } from '@/test/render';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const authApi = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), logout: vi.fn() }));
vi.mock('@/lib/api/auth', () => authApi);
const groupsApi = vi.hoisted(() => ({
  getGroup: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
  addGroupMember: vi.fn(),
  updateGroupMember: vi.fn(),
  removeGroupMember: vi.fn(),
}));
vi.mock('@/lib/api/groups', () => groupsApi);
const usersApi = vi.hoisted(() => ({ listUsers: vi.fn() }));
vi.mock('@/lib/api/users', () => usersApi);

const publicChoir = {
  id: 'g1',
  name: 'Choir',
  type: 'ministry' as const,
  description: 'We sing.',
  meetingDay: 'Wednesdays',
  meetingTime: null,
  location: null,
  leaders: [{ name: 'Ann', role: 'leader' as const }],
};
const row = (userId: string, name: string, role: string) => ({
  userId,
  name,
  role,
  joinDate: '2026-01-01T12:00:00.000Z',
  isActive: true,
  userIsActive: true,
});
const staffChoir = {
  ...publicChoir,
  isActive: true,
  memberCount: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  roster: [row('u1', 'Ann', 'leader'), row('u2', 'Ben', 'member')],
};

async function renderAs(roles: string[]) {
  authApi.me.mockResolvedValue(makeUser(roles));
  return render(
    <AuthProvider>
      <GroupDetailPage id="g1" />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GroupDetailPage', () => {
  it('shows a member the details and leaders, without the roster or controls', async () => {
    groupsApi.getGroup.mockResolvedValue(publicChoir);
    await renderAs(['member']);
    expect(screen.getByRole('heading', { level: 1, name: 'Choir' })).toBeTruthy();
    expect(screen.getByText('We sing.')).toBeTruthy();
    expect(screen.getByText('Ann (Leader)')).toBeTruthy();
    expect(screen.queryByRole('region', { name: /Roster/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('says a group the member cannot see is not found, without Retry', async () => {
    groupsApi.getGroup.mockRejectedValue(new ApiError(404, 'Group not found'));
    await renderAs(['member']);
    expect(screen.getByRole('alert')).toHaveTextContent('Group not found');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('lets staff change a role, and remove a member after confirming', async () => {
    groupsApi.getGroup.mockResolvedValue(staffChoir);
    groupsApi.updateGroupMember.mockResolvedValue(row('u2', 'Ben', 'co_leader'));
    groupsApi.removeGroupMember.mockResolvedValue(undefined);
    await renderAs(['leader']);
    const roster = screen.getByRole('region', { name: 'Roster (2 active)' });
    fireEvent.change(within(roster).getByRole('combobox', { name: 'Role of Ben' }), {
      target: { value: 'co_leader' },
    });
    await settle();
    expect(groupsApi.updateGroupMember).toHaveBeenCalledWith('g1', 'u2', { role: 'co_leader' });
    fireEvent.click(within(roster).getByRole('button', { name: 'Remove Ben' }));
    expect(groupsApi.removeGroupMember).not.toHaveBeenCalled();
    fireEvent.click(within(roster).getByRole('button', { name: 'Confirm remove Ben' }));
    await settle();
    expect(groupsApi.removeGroupMember).toHaveBeenCalledWith('g1', 'u2');
    // Leaders cannot delete a group.
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('finds active members by a debounced name and adds them with the chosen role', async () => {
    groupsApi.getGroup.mockResolvedValue(staffChoir);
    usersApi.listUsers.mockResolvedValue({
      users: [
        { id: 'u2', name: 'Ben', email: 'ben@example.org' },
        { id: 'u3', name: 'Bea', email: 'bea@example.org' },
      ],
      total: 2,
      page: 1,
      pageSize: 8,
    });
    groupsApi.addGroupMember.mockResolvedValue(row('u3', 'Bea', 'co_leader'));
    await renderAs(['leader']);
    fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), {
      target: { value: 'co_leader' },
    });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a member' }), {
      target: { value: 'Be' },
    });
    const results = await screen.findByRole('list', { name: 'Matching members' });
    expect(usersApi.listUsers).toHaveBeenCalledTimes(1);
    expect(usersApi.listUsers).toHaveBeenCalledWith(
      { q: 'Be', status: 'active', sort: 'name', pageSize: 8 },
      expect.anything(),
    );
    expect(within(results).getByText('In the group')).toBeTruthy();
    fireEvent.click(within(results).getByRole('button', { name: 'Add Bea as Co-leader' }));
    await waitFor(() => expect(screen.getByText('Bea added as Co-leader.')).toBeTruthy());
    expect(groupsApi.addGroupMember).toHaveBeenCalledWith('g1', {
      userId: 'u3',
      role: 'co_leader',
    });
  });

  it('lets an admin delete the group after confirming', async () => {
    groupsApi.getGroup.mockResolvedValue(staffChoir);
    groupsApi.deleteGroup.mockResolvedValue({ removed: 2 });
    await renderAs(['admin']);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Group?' });
    expect(dialog).toHaveTextContent('Choir and its roster (2 people) will be deleted.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Group' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/groups'));
    expect(groupsApi.deleteGroup).toHaveBeenCalledWith('g1');
  });

  describe('focus', () => {
    const roster3 = [
      row('u1', 'Ann', 'leader'),
      row('u2', 'Ben', 'member'),
      row('u3', 'Cy', 'member'),
    ];

    it('moves to the next row after a removal, and to the heading after the last row', async () => {
      groupsApi.getGroup.mockResolvedValue({ ...staffChoir, roster: roster3, memberCount: 3 });
      groupsApi.removeGroupMember.mockResolvedValue(undefined);
      await renderAs(['leader']);
      fireEvent.click(screen.getByRole('button', { name: 'Remove Ann' }));
      groupsApi.getGroup.mockResolvedValue({ ...staffChoir, roster: roster3.slice(1) });
      const confirmAnn = screen.getByRole('button', { name: 'Confirm remove Ann' });
      confirmAnn.focus();
      fireEvent.click(confirmAnn);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Ben' })).toHaveFocus());

      fireEvent.click(screen.getByRole('button', { name: 'Remove Cy' }));
      groupsApi.getGroup.mockResolvedValue({ ...staffChoir, roster: [roster3[1]] });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm remove Cy' }));
      await waitFor(() => expect(screen.getByRole('heading', { name: /^Roster/ })).toHaveFocus());
    });

    it('keeps the role select and Pause enabled while a change saves, and starts nothing else', async () => {
      groupsApi.getGroup.mockResolvedValue(staffChoir);
      let finish: (value: unknown) => void = () => undefined;
      groupsApi.updateGroupMember.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      await renderAs(['leader']);
      const role = screen.getByRole('combobox', { name: 'Role of Ben' });
      role.focus();
      fireEvent.change(role, { target: { value: 'co_leader' } });
      await settle();
      expect(role).not.toBeDisabled();
      expect(role).toHaveAttribute('aria-disabled', 'true');
      expect(role).toHaveFocus();
      fireEvent.click(screen.getByRole('button', { name: 'Pause membership of Ben' }));
      fireEvent.change(role, { target: { value: 'leader' } });
      expect(groupsApi.updateGroupMember).toHaveBeenCalledTimes(1);
      finish(row('u2', 'Ben', 'co_leader'));
      await settle();
      expect(role).not.toHaveAttribute('aria-disabled');
    });

    it('returns to the search field after an add', async () => {
      groupsApi.getGroup.mockResolvedValue(staffChoir);
      usersApi.listUsers.mockResolvedValue({
        users: [{ id: 'u3', name: 'Bea', email: 'bea@example.org' }],
        total: 1,
        page: 1,
        pageSize: 8,
      });
      groupsApi.addGroupMember.mockResolvedValue(row('u3', 'Bea', 'member'));
      await renderAs(['leader']);
      const search = screen.getByRole('searchbox', { name: 'Find a member' });
      fireEvent.change(search, { target: { value: 'Bea' } });
      const results = await screen.findByRole('list', { name: 'Matching members' });
      groupsApi.getGroup.mockResolvedValue({
        ...staffChoir,
        roster: [...staffChoir.roster, row('u3', 'Bea', 'member')],
      });
      const add = within(results).getByRole('button', { name: 'Add Bea as Member' });
      add.focus();
      fireEvent.click(add);
      await waitFor(() => expect(within(results).getByText('In the group')).toBeTruthy());
      expect(search).toHaveFocus();
    });
  });
});
