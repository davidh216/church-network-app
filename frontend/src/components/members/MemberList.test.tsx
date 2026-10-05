import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MemberList from '@/components/members/MemberList';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { makeUser } from '@/test/fixtures';
import { render } from '@/test/render';
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

function member(id: string, name: string, roleName: string, extra: Partial<Member> = {}): Member {
  return {
    id,
    name,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    roles: [{ role: { id: `role-${roleName}`, name: roleName } }],
    ...extra,
  };
}

// Deliberately unsorted, so sorting is observable.
const directory: Member[] = [
  member('m1', 'Carol Example', 'member'),
  member('m2', 'Ann Example', 'leader'),
  member('m3', 'Bob Example', 'member'),
];

const staffRows: Member[] = [
  member('m1', 'Carol Example', 'member', { email: 'carol@example.com', engagement: null }),
  member('m2', 'Ann Example', 'leader', { email: 'ann@example.com', engagement: null }),
  member('m3', 'Bob Example', 'member', {
    email: 'bob@example.com',
    isActive: false,
    engagement: null,
  }),
];

const noop = () => undefined;

async function renderAs(roleNames: string[]) {
  authApi.me.mockResolvedValue(makeUser(roleNames));
  return render(
    <AuthProvider>
      <MemberList onEditMember={noop} onAddMember={noop} refreshTrigger={0} />
    </AuthProvider>,
  );
}

/** Member names in table order. */
function rowNames(): string[] {
  const body = screen.getAllByRole('rowgroup')[1]!;
  return within(body)
    .getAllByRole('row')
    .map((row) => directory.find((m) => row.textContent?.includes(m.name))?.name ?? '?');
}

beforeEach(() => {
  vi.resetAllMocks();
  usersApi.listUsers.mockResolvedValue(directory);
});

describe('MemberList', () => {
  it('renders a row per member from the API', async () => {
    await renderAs(['member']);
    expect(usersApi.listUsers).toHaveBeenCalledTimes(1);
    expect(rowNames()).toEqual(['Carol Example', 'Ann Example', 'Bob Example']);
    expect(screen.getByText('(3 of 3)')).toBeInTheDocument();
  });

  it('sorts by name ascending, then descending, then back to API order without throwing', async () => {
    await renderAs(['member']);
    const nameHeader = screen.getByRole('columnheader', { name: /Member/ });

    fireEvent.click(nameHeader);
    expect(rowNames()).toEqual(['Ann Example', 'Bob Example', 'Carol Example']);
    expect(within(nameHeader).getByText('↑')).toBeInTheDocument();

    fireEvent.click(nameHeader);
    expect(rowNames()).toEqual(['Carol Example', 'Bob Example', 'Ann Example']);
    expect(within(nameHeader).getByText('↓')).toBeInTheDocument();

    fireEvent.click(nameHeader);
    expect(rowNames()).toEqual(['Carol Example', 'Ann Example', 'Bob Example']);
  });

  it('sorts staff columns whose values are missing without throwing', async () => {
    usersApi.listUsers.mockResolvedValue(staffRows);
    await renderAs(['admin']);
    fireEvent.click(screen.getByRole('columnheader', { name: /Engagement/ }));
    fireEvent.click(screen.getByRole('columnheader', { name: /Contact/ }));
    expect(rowNames()).toEqual(['Ann Example', 'Bob Example', 'Carol Example']);
  });

  it('reduces rows with the search box and the role filter, and restores them on Clear All', async () => {
    await renderAs(['member']);

    fireEvent.change(screen.getByPlaceholderText(/Search by name/), { target: { value: 'bob' } });
    expect(rowNames()).toEqual(['Bob Example']);
    expect(screen.getByText('(1 of 3)')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search by name/), { target: { value: '' } });
    fireEvent.change(screen.getByDisplayValue('All Roles'), { target: { value: 'leader' } });
    expect(rowNames()).toEqual(['Ann Example']);

    fireEvent.change(screen.getByDisplayValue('Leader'), { target: { value: 'admin' } });
    expect(screen.queryAllByRole('row')).toHaveLength(1); // header row only
    expect(screen.getByText('No members found')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear All' }));
    expect(rowNames()).toHaveLength(3);
  });

  it('lets staff filter by status', async () => {
    usersApi.listUsers.mockResolvedValue(staffRows);
    await renderAs(['leader']);
    fireEvent.change(screen.getByDisplayValue('All Status'), { target: { value: 'inactive' } });
    expect(rowNames()).toEqual(['Bob Example']);
    fireEvent.change(screen.getByDisplayValue('Inactive'), { target: { value: 'active' } });
    expect(rowNames()).toEqual(['Carol Example', 'Ann Example']);
  });

  it('hides staff-only controls from a member', async () => {
    await renderAs(['member']);
    expect(screen.getByText('Ann Example')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Member' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export/ })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('shows the staff controls, and Export after selecting a row, to a leader', async () => {
    usersApi.listUsers.mockResolvedValue(staffRows);
    await renderAs(['leader']);
    expect(screen.getByRole('button', { name: 'Add Member' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'View' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Export Selected/ })).not.toBeInTheDocument();

    const body = screen.getAllByRole('rowgroup')[1]!;
    fireEvent.click(within(body).getAllByRole('checkbox')[0]!);
    expect(screen.getByRole('button', { name: 'Export Selected (1)' })).toBeInTheDocument();
  });
});
