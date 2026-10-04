import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddEditMemberModal from '@/components/members/AddEditMemberModal';
import { ApiError } from '@/lib/api/client';
import { render, settle } from '@/test/render';
import type { Member, Role } from '@/types/domain';

const rolesApi = vi.hoisted(() => ({ listRoles: vi.fn() }));
vi.mock('@/lib/api/roles', () => rolesApi);

const usersApi = vi.hoisted(() => ({ createUser: vi.fn(), updateUser: vi.fn() }));
vi.mock('@/lib/api/users', () => usersApi);

const roles: Role[] = [
  { id: 'role-admin', name: 'admin' },
  { id: 'role-leader', name: 'leader' },
  { id: 'role-member', name: 'member' },
];

const existing: Member = {
  id: 'cmember000000000000000001',
  name: 'Ann Example',
  email: 'ann@example.com',
  phone: '555-0100',
  bio: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  roles: [{ role: roles[2]! }],
};

const onSave = vi.fn();
const onClose = vi.fn();

async function open(member?: Member) {
  return render(<AddEditMemberModal isOpen onClose={onClose} onSave={onSave} member={member ?? null} />);
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function submit(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
  await settle();
}

beforeEach(() => {
  vi.resetAllMocks();
  rolesApi.listRoles.mockResolvedValue(roles);
  usersApi.createUser.mockImplementation(async () => existing);
  usersApi.updateUser.mockImplementation(async () => existing);
});

describe('AddEditMemberModal', () => {
  it('renders nothing when closed', async () => {
    const { container } = await render(
      <AddEditMemberModal isOpen={false} onClose={onClose} onSave={onSave} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(rolesApi.listRoles).not.toHaveBeenCalled();
  });

  it('create sends roleIds (defaulting to the member role) and isActive', async () => {
    await open();
    expect(screen.getByRole('heading', { name: 'Add New Member' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /member/ })).toBeChecked();
    expect(screen.getByLabelText('Password *')).toHaveAttribute('minLength', '12');

    type('Full Name *', 'New Person');
    type('Email *', 'new@example.com');
    type('Password *', 'a long temporary password');
    fireEvent.click(screen.getByRole('checkbox', { name: /leader/ }));
    await submit('Add Member');

    expect(usersApi.createUser).toHaveBeenCalledTimes(1);
    expect(usersApi.createUser).toHaveBeenCalledWith({
      name: 'New Person',
      email: 'new@example.com',
      password: 'a long temporary password',
      phone: null,
      bio: null,
      isActive: true,
      roleIds: ['role-member', 'role-leader'],
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('create sends isActive false when the box is unticked', async () => {
    await open();
    type('Full Name *', 'Pending Person');
    type('Email *', 'pending@example.com');
    type('Password *', 'a long temporary password');
    fireEvent.click(screen.getByLabelText('Active Member'));
    await submit('Add Member');
    expect(usersApi.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false, roleIds: ['role-member'] }),
    );
  });

  it('update omits roleIds and isActive when neither changed', async () => {
    await open(existing);
    expect(screen.getByRole('heading', { name: 'Edit Member' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email *')).toBeDisabled();
    expect(screen.queryByLabelText('Password *')).not.toBeInTheDocument();

    type('Full Name *', 'Ann Renamed');
    await submit('Update Member');

    expect(usersApi.updateUser).toHaveBeenCalledTimes(1);
    const [id, payload] = usersApi.updateUser.mock.calls[0]!;
    expect(id).toBe(existing.id);
    expect(payload).toEqual({ name: 'Ann Renamed', phone: '555-0100', bio: null });
    expect(payload).not.toHaveProperty('roleIds');
    expect(payload).not.toHaveProperty('isActive');
  });

  it('update sends roleIds when the roles changed', async () => {
    await open(existing);
    fireEvent.click(screen.getByRole('checkbox', { name: /leader/ }));
    await submit('Update Member');
    expect(usersApi.updateUser).toHaveBeenCalledWith(existing.id, {
      name: 'Ann Example',
      phone: '555-0100',
      bio: null,
      roleIds: ['role-member', 'role-leader'],
    });
  });

  it('update does not send roleIds when a role is toggled off and on again', async () => {
    await open(existing);
    const memberBox = screen.getByRole('checkbox', { name: /member/ });
    fireEvent.click(memberBox);
    fireEvent.click(memberBox);
    await submit('Update Member');
    expect(usersApi.updateUser.mock.calls[0]![1]).not.toHaveProperty('roleIds');
  });

  it('update sends isActive only when it changed', async () => {
    await open(existing);
    fireEvent.click(screen.getByLabelText('Active Member'));
    await submit('Update Member');
    expect(usersApi.updateUser).toHaveBeenCalledWith(existing.id, {
      name: 'Ann Example',
      phone: '555-0100',
      bio: null,
      isActive: false,
    });
  });

  it('shows the API error and stays open when saving fails', async () => {
    usersApi.updateUser.mockRejectedValue(new ApiError(403, 'Insufficient permissions'));
    await open(existing);
    await submit('Update Member');
    expect(screen.getByText('Insufficient permissions')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
