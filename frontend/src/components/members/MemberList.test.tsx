import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MemberList from '@/components/members/MemberList';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { makeUser } from '@/test/fixtures';
import { render } from '@/test/render';
import { ApiError } from '@/lib/api/client';
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

const usersApi = vi.hoisted(() => ({
  listUsers: vi.fn(),
  searchUsers: vi.fn(),
  exportUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('@/lib/api/users', () => usersApi);

const savedApi = vi.hoisted(() => ({
  listSavedSearches: vi.fn(),
  createSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
  useSavedSearch: vi.fn(),
}));
vi.mock('@/lib/api/savedSearches', () => savedApi);

const rolesApi = vi.hoisted(() => ({ listRoles: vi.fn() }));
vi.mock('@/lib/api/roles', () => rolesApi);

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

async function renderAs(roleNames: string[]) {
  authApi.me.mockResolvedValue(makeUser(roleNames));
  return render(
    <AuthProvider>
      <MemberList />
    </AuthProvider>,
  );
}

function page(users: Member[], total = users.length, pageNumber = 1, pageSize = 25) {
  return { users, total, page: pageNumber, pageSize };
}

/** The params of the latest GET /api/users call. */
function lastParams(): Record<string, unknown> {
  return usersApi.listUsers.mock.calls.at(-1)?.[0] as Record<string, unknown>;
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
  usersApi.listUsers.mockResolvedValue(page(directory));
});

describe('MemberList', () => {
  it('renders the page of members the API returns, with the total across pages', async () => {
    usersApi.listUsers.mockResolvedValue(page(directory, 40));
    await renderAs(['member']);
    expect(usersApi.listUsers).toHaveBeenCalledTimes(1);
    expect(lastParams()).toEqual({ q: undefined, page: 1, pageSize: 25 });
    expect(rowNames()).toEqual(['Carol Example', 'Ann Example', 'Bob Example']);
    expect(screen.getByText('(40 total)')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });

  it('sorts on the server: ascending, descending, then unsorted', async () => {
    await renderAs(['member']);
    const nameHeader = () => screen.getByRole('columnheader', { name: /Member/ });
    const sortByName = () => fireEvent.click(within(nameHeader()).getByRole('button'));

    sortByName();
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'name', order: 'asc' }));
    expect(nameHeader()).toHaveAttribute('aria-sort', 'ascending');
    expect(within(nameHeader()).getByText('↑')).toBeInTheDocument();

    sortByName();
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'name', order: 'desc' }));
    expect(within(nameHeader()).getByText('↓')).toBeInTheDocument();

    sortByName();
    await waitFor(() => expect(lastParams()).not.toHaveProperty('sort'));
    expect(nameHeader()).toHaveAttribute('aria-sort', 'none');
  });

  it('lets staff sort by the engagement and contact columns', async () => {
    usersApi.listUsers.mockResolvedValue(page(staffRows));
    await renderAs(['admin']);
    fireEvent.click(screen.getByRole('button', { name: 'Engagement' }));
    await waitFor(() =>
      expect(lastParams()).toMatchObject({ sort: 'engagementScore', order: 'asc' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Contact' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'email', order: 'asc' }));
  });

  it('says in the search placeholder what each caller may search', async () => {
    await renderAs(['member']);
    expect(screen.getByRole('textbox', { name: 'Search members' })).toHaveAttribute(
      'placeholder',
      'Search by name...',
    );
  });

  it('offers staff the full search placeholder', async () => {
    await renderAs(['admin']);
    expect(screen.getByRole('textbox', { name: 'Search members' })).toHaveAttribute(
      'placeholder',
      'Search by name, email, phone, or bio...',
    );
  });

  it('debounces the search box, keeps focus and the current rows, and sends one request', async () => {
    await renderAs(['member']);
    const input = screen.getByPlaceholderText(/Search by name/);
    input.focus();
    for (const value of ['b', 'bo', 'bob']) {
      fireEvent.change(input, { target: { value } });
    }
    // Before the debounce fires: no new request, the rows stay and the input keeps focus.
    expect(usersApi.listUsers).toHaveBeenCalledTimes(1);
    expect(rowNames()).toHaveLength(3);

    usersApi.listUsers.mockResolvedValue(page([directory[2]!]));
    await waitFor(() => expect(lastParams()).toMatchObject({ q: 'bob', page: 1 }));
    expect(usersApi.listUsers).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(rowNames()).toEqual(['Bob Example']));
    expect(document.activeElement).toBe(screen.getByPlaceholderText(/Search by name/));
    expect(screen.getByDisplayValue('bob')).toBeInTheDocument();
  });

  it('pages on the server and returns to page 1 when a filter changes', async () => {
    usersApi.listUsers.mockResolvedValue(page(staffRows, 60));
    await renderAs(['admin']);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2, pageSize: 25 }));

    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'leader' } });
    await waitFor(() => expect(lastParams()).toMatchObject({ role: 'leader', page: 1 }));

    fireEvent.change(screen.getByDisplayValue('25'), { target: { value: '50' } });
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 1, pageSize: 50 }));
  });

  it('sends the staff filters, with the joined date range inclusive as typed', async () => {
    usersApi.listUsers.mockResolvedValue(page(staffRows));
    await renderAs(['leader']);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'inactive' } });
    fireEvent.change(screen.getByLabelText('Membership stage'), {
      target: { value: 'new_member' },
    });
    fireEvent.change(screen.getByLabelText('Risk level'), { target: { value: 'high' } });
    fireEvent.change(screen.getByLabelText('Joined from'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Joined to (inclusive)'), {
      target: { value: '2026-01-31' },
    });
    await waitFor(() =>
      expect(lastParams()).toMatchObject({
        status: 'inactive',
        stage: 'new_member',
        risk: 'high',
        joinedFrom: '2026-01-01',
        joinedTo: '2026-01-31',
        page: 1,
      }),
    );

    // An inverted range is reported and not sent.
    fireEvent.change(screen.getByLabelText('Joined from'), { target: { value: '2026-02-01' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('start date is after the end date');
    await waitFor(() => expect(lastParams()).not.toHaveProperty('joinedFrom', '2026-02-01'));
    expect(lastParams()).toMatchObject({ joinedFrom: undefined, joinedTo: undefined });

    fireEvent.click(screen.getByRole('button', { name: 'Clear All' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ status: undefined, risk: undefined }));
  });

  it('shows "No members found" with a clear action when the filters match nothing', async () => {
    await renderAs(['admin']);
    usersApi.listUsers.mockResolvedValue(page([]));
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'admin' } });
    expect(await screen.findByText('No members found')).toBeInTheDocument();
    usersApi.listUsers.mockResolvedValue(page(directory));
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    await waitFor(() => expect(rowNames()).toHaveLength(3));
  });

  it('shows an inline error with Retry when the list fails to load', async () => {
    usersApi.listUsers.mockRejectedValue(new ApiError(500, 'Database unavailable'));
    await renderAs(['admin']);
    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
    usersApi.listUsers.mockResolvedValue(page(staffRows));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(rowNames()).toHaveLength(3));
  });

  it('hides staff-only controls and filters from a member', async () => {
    await renderAs(['member']);
    expect(screen.getByText('Ann Example')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Member' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export/ })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
    // The API lets members search by name and sort by name only.
    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Joined from')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Joined' })).not.toHaveAttribute('aria-sort');
    // Sortable headers are buttons inside the header cell; members only get the name one.
    expect(
      within(screen.getByRole('columnheader', { name: 'Member' })).getByRole('button'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('columnheader', { name: 'Joined' })).queryByRole('button'),
    ).toBeNull();
  });

  it('shows the staff controls, and Export after selecting a row, to a leader', async () => {
    usersApi.listUsers.mockResolvedValue(page(staffRows));
    await renderAs(['leader']);
    expect(screen.getByRole('button', { name: 'Add Member' })).toBeInTheDocument();
    // Profiles are routes now: "View" is a link to /members/[id].
    expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'View' }).map((a) => a.getAttribute('href')),
    ).toEqual(['/members/m1', '/members/m2', '/members/m3']);
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Export Selected/ })).not.toBeInTheDocument();

    const body = screen.getAllByRole('rowgroup')[1]!;
    fireEvent.click(within(body).getAllByRole('checkbox')[0]!);
    expect(screen.getByRole('button', { name: 'Export Selected (1)' })).toBeInTheDocument();
  });

  it('selects all on the current page and counts a selection across pages honestly', async () => {
    usersApi.listUsers.mockResolvedValue(page(staffRows, 30));
    await renderAs(['admin']);
    const selectAll = screen.getByLabelText('Select all members on this page');
    fireEvent.click(selectAll);
    expect(screen.getAllByText('3 selected').length).toBeGreaterThan(0);

    const nextRows = [member('m4', 'Dan Example', 'member', { email: 'dan@example.com' })];
    usersApi.listUsers.mockResolvedValue(page(nextRows, 30, 2));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText('Dan Example')).toBeInTheDocument());
    expect(screen.getByText('3 selected across pages')).toBeInTheDocument();
    expect(screen.getByLabelText('Select all members on this page')).not.toBeChecked();
    // Each row's checkbox is named after its member.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Dan Example' }));
    expect(screen.getByText('4 selected across pages')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Dan Example' }));

    fireEvent.click(screen.getByLabelText('Select all members on this page'));
    expect(screen.getByText('4 selected across pages')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export Selected (4)' })).toBeInTheDocument();
  });

  it('opens the member form in place for Add Member and Edit, and refetches after saving', async () => {
    usersApi.listUsers.mockResolvedValue(page(staffRows));
    rolesApi.listRoles.mockResolvedValue([]);
    usersApi.updateUser.mockResolvedValue(staffRows[1]);
    await renderAs(['admin']);
    expect(screen.queryByText('Add New Member')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Member' }));
    expect(screen.getByText('Add New Member')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Add New Member')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]!);
    expect(screen.getByRole('heading', { name: 'Edit Member' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ann Example')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: /Update|Save/ }),
      );
    });
    expect(usersApi.updateUser).toHaveBeenCalledWith('m2', expect.any(Object));
    // The update invalidates the member queries, so the list refetches.
    await waitFor(() => expect(usersApi.listUsers).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('heading', { name: 'Edit Member' })).not.toBeInTheDocument();
  });

  it('runs an advanced query from the quick filters, shows its result, and clears it', async () => {
    usersApi.listUsers.mockResolvedValue(page(staffRows));
    usersApi.searchUsers.mockResolvedValue(page([staffRows[1]!], 31));
    await renderAs(['admin']);
    await screen.findByText('Carol Example');

    fireEvent.change(screen.getByLabelText('Membership stage'), {
      target: { value: 'new_member' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Search' }));
    // The builder starts from the quick filters.
    expect(screen.getByLabelText('Condition 1 field')).toHaveValue('engagement.membershipStage');
    expect(screen.getByLabelText('Condition 1 value')).toHaveValue('new_member');
    fireEvent.click(screen.getByRole('button', { name: 'Add Condition' }));
    fireEvent.change(screen.getByLabelText('Condition 2 field'), {
      target: { value: 'engagement.engagementScore' },
    });
    fireEvent.change(screen.getByLabelText('Condition 2 operator'), { target: { value: 'gte' } });
    fireEvent.change(screen.getByLabelText('Condition 2 value'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Search' }));

    await waitFor(() =>
      expect(usersApi.searchUsers).toHaveBeenCalledWith({
        conditions: [
          { field: 'engagement.membershipStage', operator: 'equals', value: 'new_member' },
          { field: 'engagement.engagementScore', operator: 'gte', value: 50 },
        ],
        logic: 'AND',
        page: 1,
        pageSize: 25,
      }),
    );
    expect(await screen.findByText('(31 total)')).toBeInTheDocument();
    expect(rowNames()).toEqual(['Ann Example']);
    expect(screen.getByText('Advanced query active')).toBeInTheDocument();
    // The quick filters are folded into the query, so they are hidden while it is active.
    expect(screen.queryByLabelText('Membership stage')).not.toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    // Paging and sorting go to the search, not the list.
    const listCalls = usersApi.listUsers.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(usersApi.searchUsers).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })),
    );
    expect(usersApi.listUsers).toHaveBeenCalledTimes(listCalls);

    fireEvent.click(screen.getByRole('button', { name: 'Clear advanced query' }));
    await waitFor(() =>
      expect(screen.queryByText('Advanced query active')).not.toBeInTheDocument(),
    );
    expect(await screen.findByText('Carol Example')).toBeInTheDocument();
    expect(screen.getByLabelText('Membership stage')).toHaveValue('all');
  });

  it('saves the quick filters as a query and applies a saved search through the search API', async () => {
    usersApi.listUsers.mockResolvedValue(page(staffRows));
    usersApi.searchUsers.mockResolvedValue(page([staffRows[2]!]));
    const query = {
      conditions: [{ field: 'engagement.riskLevel', operator: 'equals', value: 'high' }],
      logic: 'AND',
      sort: 'name',
      order: 'desc',
    };
    savedApi.listSavedSearches.mockResolvedValue([
      {
        id: 's1',
        name: 'High risk',
        description: null,
        createdAt: '2026-10-01',
        isPublic: false,
        invalid: false,
        query,
      },
    ]);
    savedApi.createSavedSearch.mockResolvedValue({ id: 's2' });
    savedApi.useSavedSearch.mockResolvedValue(undefined);
    await renderAs(['admin']);
    await screen.findByText('Carol Example');

    fireEvent.change(screen.getByLabelText('Risk level'), { target: { value: 'high' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saved Searches' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Current Search' }));
    fireEvent.change(screen.getByLabelText('Search name'), { target: { value: 'High risk' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(savedApi.createSavedSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'High risk',
        query: {
          conditions: [{ field: 'engagement.riskLevel', operator: 'equals', value: 'high' }],
          logic: 'AND',
        },
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Apply High risk' }));
    await waitFor(() =>
      expect(usersApi.searchUsers).toHaveBeenCalledWith({
        conditions: query.conditions,
        logic: 'AND',
        sort: 'name',
        order: 'desc',
        page: 1,
        pageSize: 25,
      }),
    );
    await waitFor(() => expect(savedApi.useSavedSearch).toHaveBeenCalledWith('s1'));
    expect(await screen.findByText('Advanced query active')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Saved Searches' })).not.toBeInTheDocument();
  });
});
