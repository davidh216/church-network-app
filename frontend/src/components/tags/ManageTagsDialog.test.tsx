import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tag } from '@embrace/shared';
import ManageTagsDialog from '@/components/tags/ManageTagsDialog';
import { ApiError } from '@/lib/api/client';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { makeUser } from '@/test/fixtures';
import { render } from '@/test/render';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const authApi = vi.hoisted(() => ({
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => authApi);
const tagsApi = vi.hoisted(() => ({
  listTags: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
  assignTag: vi.fn(),
  unassignTag: vi.fn(),
}));
vi.mock('@/lib/api/tags', () => tagsApi);

const tag = (overrides: Partial<Tag>): Tag => ({
  id: 't1',
  name: 'Choir',
  color: '#3b82f6',
  category: 'ministry',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  usageCount: 3,
  ...overrides,
});
const choir = tag({});
const retired = tag({ id: 't2', name: 'Retired', isActive: false, usageCount: 1 });

async function renderAs(roles: string[]) {
  authApi.me.mockResolvedValue(makeUser(roles));
  const onClose = vi.fn();
  await render(
    <AuthProvider>
      <ManageTagsDialog onClose={onClose} />
    </AuthProvider>,
  );
  return onClose;
}

beforeEach(() => {
  vi.resetAllMocks();
  tagsApi.listTags.mockResolvedValue([choir, retired]);
});

describe('ManageTagsDialog', () => {
  it('lists every tag, archived ones included, with category and usage', async () => {
    await renderAs(['leader']);
    const dialog = screen.getByRole('dialog', { name: 'Manage Tags' });
    expect(tagsApi.listTags).toHaveBeenCalledWith(true, expect.anything());
    expect(within(dialog).getByText('Ministry · 3 members')).toBeTruthy();
    expect(within(dialog).getByText('Ministry · 1 member')).toBeTruthy();
    expect(within(dialog).getByText('Retired').textContent).toBe('Retired (archived)');
    // Leaders cannot delete.
    expect(within(dialog).queryByRole('button', { name: /^Delete/ })).toBeNull();
  });

  it('creates a tag, then returns to the list with focus on New Tag', async () => {
    tagsApi.createTag.mockResolvedValue(tag({ id: 't3', name: 'Youth' }));
    await renderAs(['leader']);
    fireEvent.click(screen.getByRole('button', { name: 'New Tag' }));
    const name = screen.getByLabelText('Name *');
    await waitFor(() => expect(document.activeElement).toBe(name));
    fireEvent.change(name, { target: { value: ' Youth ' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'demographic' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Tag' }));
    await waitFor(() =>
      expect(tagsApi.createTag).toHaveBeenCalledWith({
        name: 'Youth',
        color: '#3B82F6',
        category: 'demographic',
      }),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New Tag' })),
    );
  });

  it('shows the API conflict for a duplicate name and checks the name first', async () => {
    tagsApi.createTag.mockRejectedValue(
      new ApiError(409, 'A tag with this name already exists', 'CONFLICT'),
    );
    await renderAs(['leader']);
    fireEvent.click(screen.getByRole('button', { name: 'New Tag' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Tag' }));
    expect(await screen.findByText('Name is required')).toBeTruthy();
    expect(tagsApi.createTag).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'choir' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Tag' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'A tag with this name already exists',
    );
  });

  it('edits only what changed, and archives and restores', async () => {
    tagsApi.updateTag.mockResolvedValue(choir);
    await renderAs(['leader']);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Choir' }));
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Choir Team' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Tag' }));
    await waitFor(() =>
      expect(tagsApi.updateTag).toHaveBeenCalledWith('t1', { name: 'Choir Team' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Choir' }));
    await waitFor(() => expect(tagsApi.updateTag).toHaveBeenCalledWith('t1', { isActive: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore Retired' }));
    await waitFor(() => expect(tagsApi.updateTag).toHaveBeenCalledWith('t2', { isActive: true }));
  });

  it('lets an admin delete after a confirmation naming the members affected', async () => {
    tagsApi.deleteTag.mockResolvedValue({ removed: 3 });
    await renderAs(['admin']);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Choir' }));
    expect(screen.getByRole('heading', { name: 'Delete the tag Choir?' })).toBeTruthy();
    expect(screen.getByText(/removed from 3 members/)).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' })),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete from 3 members' }));
    await waitFor(() => expect(tagsApi.deleteTag).toHaveBeenCalledWith('t1'));
    expect(await screen.findByRole('button', { name: 'New Tag' })).toBeTruthy();
  });
});
