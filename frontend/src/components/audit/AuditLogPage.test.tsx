import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditEvent } from '@embrace/shared';
import AuditLogPage, { auditParams } from '@/components/audit/AuditLogPage';
import RequireAdmin from '@/components/auth/RequireAdmin';
import { EMPTY_AUDIT_FILTERS } from '@/components/audit/AuditFilters';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { makeUser } from '@/test/fixtures';
import { render, settle } from '@/test/render';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const authApi = vi.hoisted(() => ({
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => authApi);
const auditApi = vi.hoisted(() => ({ listAudit: vi.fn() }));
vi.mock('@/lib/api/audit', () => auditApi);

const roleChange: AuditEvent = {
  id: 'e1',
  action: 'user_role_changed',
  actor: { id: 'a1', name: 'Ada Admin' },
  targetType: 'user',
  targetId: 'u1',
  targetName: 'Mo Member',
  targetExists: true,
  count: null,
  metadata: { from: ['member'], to: ['leader'] },
  createdAt: '2026-10-01T12:00:00.000Z',
};
const tagDeleted: AuditEvent = {
  id: 'e2',
  action: 'tag_deleted',
  actor: null,
  targetType: 'tag',
  targetId: 't1',
  targetName: 'Choir',
  targetExists: false,
  count: 4,
  metadata: { name: 'Choir' },
  createdAt: '2026-09-30T12:00:00.000Z',
};

async function renderAs(roles: string[]) {
  authApi.me.mockResolvedValue(makeUser(roles));
  return render(
    <AuthProvider>
      <RequireAdmin>
        <AuditLogPage />
      </RequireAdmin>
    </AuthProvider>,
  );
}

const lastParams = () => auditApi.listAudit.mock.calls.at(-1)![0] as Record<string, unknown>;

beforeEach(() => {
  vi.resetAllMocks();
  auditApi.listAudit.mockResolvedValue({
    events: [roleChange, tagDeleted],
    total: 2,
    page: 1,
    pageSize: 50,
  });
});

describe('AuditLogPage', () => {
  it('lists events with actor, action, linked target and details', async () => {
    await renderAs(['admin']);
    const rows = await screen.findAllByRole('row');
    const first = within(rows[1]!);
    expect(first.getByText('Ada Admin')).toBeTruthy();
    expect(first.getByText('User role changed')).toBeTruthy();
    expect(first.getByRole('link', { name: 'Mo Member' }).getAttribute('href')).toBe('/members/u1');
    expect(first.getByText('member → leader')).toBeTruthy();
    const second = within(rows[2]!);
    expect(second.getByText('Deleted account')).toBeTruthy();
    // Tags have no page of their own.
    expect(second.queryByRole('link')).toBeNull();
    expect(second.getByText('count: 4')).toBeTruthy();
    expect(lastParams()).toMatchObject({ page: 1, pageSize: 50 });
  });

  it('filters by action, actor and target, and removes a chip', async () => {
    await renderAs(['admin']);
    await screen.findByText('Ada Admin');
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'tag_deleted' } });
    await waitFor(() => expect(lastParams()).toMatchObject({ action: 'tag_deleted' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show only changes by Ada Admin' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ actorId: 'a1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show only changes to Mo Member' }));
    await waitFor(() =>
      expect(lastParams()).toMatchObject({ targetType: 'user', targetId: 'u1', actorId: 'a1' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: by Ada Admin' }));
    await waitFor(() => expect(lastParams().actorId).toBeUndefined());
  });

  it('does not ask for a reversed date range', async () => {
    await renderAs(['admin']);
    await screen.findByText('Ada Admin');
    const calls = auditApi.listAudit.mock.calls.length;
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-05' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-01' } });
    await settle();
    expect(screen.getByText('The end date must not be before the start date')).toBeTruthy();
    expect(auditApi.listAudit.mock.calls.length).toBe(calls + 1);
    expect(lastParams()).toMatchObject({ from: '2026-10-05' });
  });

  it('sends a leader back to the dashboard', async () => {
    await renderAs(['leader']);
    expect(router.replace).toHaveBeenCalledWith('/?notice=admin-only');
    expect(auditApi.listAudit).not.toHaveBeenCalled();
  });

  it('maps filters to API parameters', () => {
    expect(auditParams(EMPTY_AUDIT_FILTERS)).toEqual({
      actorId: undefined,
      action: undefined,
      targetType: undefined,
      targetId: undefined,
      from: undefined,
      to: undefined,
    });
    expect(
      auditParams({
        ...EMPTY_AUDIT_FILTERS,
        targetType: 'tag',
        target: { type: 'user', id: 'u1', name: 'Mo' },
      }),
    ).toMatchObject({ targetType: 'user', targetId: 'u1' });
  });
});
