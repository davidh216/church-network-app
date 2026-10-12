import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tag } from '@embrace/shared';
import TagsSection from '@/components/members/profile/TagsSection';
import { ApiError } from '@/lib/api/client';
import { render } from '@/test/render';
import type { MemberDetails } from '@/types/domain';

const tagsApi = vi.hoisted(() => ({
  listTags: vi.fn(),
  assignTag: vi.fn(),
  unassignTag: vi.fn(),
}));
vi.mock('@/lib/api/tags', () => tagsApi);

const active = (id: string, name: string): Tag => ({
  id,
  name,
  color: '#123456',
  category: 'general',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  usageCount: 1,
});
const assignment = (id: string, name: string, isActive = true) => ({
  id: `a-${id}`,
  addedAt: '2026-01-01T00:00:00.000Z',
  tag: { id, name, color: '#123456', category: 'general' as const, isActive },
});
const member = {
  id: 'u1',
  name: 'Ada',
  memberTags: [assignment('t1', 'Choir'), assignment('t9', 'Old list', false)],
} as unknown as MemberDetails;

beforeEach(() => {
  vi.resetAllMocks();
  tagsApi.listTags.mockResolvedValue([active('t1', 'Choir'), active('t2', 'Youth')]);
  tagsApi.assignTag.mockResolvedValue({ added: true, memberTags: [] });
  tagsApi.unassignTag.mockResolvedValue({ memberTags: [] });
});

const input = () => screen.getByRole('combobox', { name: 'Tags (staff only)' });

describe('TagsSection', () => {
  it('shows the member tags, archived ones marked, and suggests only the others', async () => {
    const { container } = await render(<TagsSection member={member} />);
    expect(screen.getByRole('button', { name: 'Remove Choir' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Old list (archived)' })).toBeTruthy();
    expect(tagsApi.listTags).toHaveBeenCalledWith(false, expect.anything());
    await waitFor(() =>
      expect(
        Array.from(container.querySelectorAll('datalist option')).map((o) =>
          o.getAttribute('value'),
        ),
      ).toEqual(['Youth']),
    );
  });

  it('assigns a typed tag by its own spelling', async () => {
    await render(<TagsSection member={member} />);
    await waitFor(() => expect(tagsApi.listTags).toHaveBeenCalled());
    fireEvent.change(input(), { target: { value: 'youth' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(tagsApi.assignTag).toHaveBeenCalledWith('u1', 't2'));
  });

  it('refuses a name that is not an active tag', async () => {
    await render(<TagsSection member={member} />);
    await waitFor(() => expect(tagsApi.listTags).toHaveBeenCalled());
    fireEvent.change(input(), { target: { value: 'Unknown' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect((await screen.findByRole('alert')).textContent).toBe(
      'There is no active tag called "Unknown". Create it with Manage Tags.',
    );
    expect(tagsApi.assignTag).not.toHaveBeenCalled();
  });

  it('unassigns a removed chip, archived ones too, and shows a failure', async () => {
    tagsApi.unassignTag.mockRejectedValueOnce(new ApiError(500, 'Server down'));
    await render(<TagsSection member={member} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Old list (archived)' }));
    await waitFor(() => expect(tagsApi.unassignTag).toHaveBeenCalledWith('u1', 't9'));
    expect((await screen.findByRole('alert')).textContent).toBe('Server down');
    // The chip is back once the failed change settles.
    expect(screen.getByRole('button', { name: 'Remove Old list (archived)' })).toBeTruthy();
  });
});
