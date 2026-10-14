import { fireEvent, render as rtl, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tag } from '@embrace/shared';
import TagsSection from '@/components/members/profile/TagsSection';
import { ApiError } from '@/lib/api/client';
import { queryWrapper, render, settle } from '@/test/render';
import type { MemberDetails } from '@/types/domain';

const tagsApi = vi.hoisted(() => ({
  listTags: vi.fn(),
  assignTag: vi.fn(),
  unassignTag: vi.fn(),
}));
vi.mock('@/lib/api/tags', () => tagsApi);

const active = (id: string, name: string, isActive = true): Tag => ({
  id,
  name,
  color: '#123456',
  category: 'general',
  isActive,
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
  tagsApi.listTags.mockResolvedValue([
    active('t1', 'Choir'),
    active('t2', 'Youth'),
    active('t8', 'Retired', false),
    active('t9', 'Old list', false),
  ]);
  tagsApi.assignTag.mockResolvedValue({ added: true, memberTags: [] });
  tagsApi.unassignTag.mockResolvedValue({ memberTags: [] });
});

const input = () => screen.getByRole('combobox', { name: 'Tags (staff only)' });
/** The section's own status (ChipInput has one too, for refused entries). */
const status = () => screen.getByText((_, el) => el?.matches('section > p[role=status]') ?? false);
const notice = () => document.getElementById('profile-tags-notice');
const typeAndEnter = (text: string) => {
  fireEvent.change(input(), { target: { value: text } });
  fireEvent.keyDown(input(), { key: 'Enter' });
};
/** Renders the section and waits until the tags have loaded (the picker is read-only before). */
async function renderReady() {
  const result = await render(<TagsSection member={member} />);
  await waitFor(() => expect(input()).not.toHaveAttribute('readonly'));
  return result;
}
/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('TagsSection', () => {
  it('shows the member tags, archived ones marked, and suggests only the others', async () => {
    const { container } = await render(<TagsSection member={member} />);
    expect(screen.getByRole('button', { name: 'Remove Choir' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Old list (archived)' })).toBeTruthy();
    expect(tagsApi.listTags).toHaveBeenCalledWith(true, expect.anything());
    await waitFor(() =>
      expect(
        Array.from(container.querySelectorAll('datalist option')).map((o) =>
          o.getAttribute('value'),
        ),
      ).toEqual(['Youth']),
    );
  });

  it('assigns a typed tag by its own spelling', async () => {
    await renderReady();
    typeAndEnter('youth');
    await waitFor(() => expect(tagsApi.assignTag).toHaveBeenCalledWith('u1', 't2'));
    await waitFor(() => expect(status()).toHaveTextContent('Added Youth'));
    expect(input()).toHaveValue('');
  });

  it('refuses a name that is not an active tag, keeping it, and never announces it as added', async () => {
    await renderReady();
    typeAndEnter('Choyr');
    expect(notice()).toHaveTextContent(
      'There is no active tag called "Choyr". Create it with Manage Tags.',
    );
    expect(input()).toHaveValue('Choyr');
    expect(screen.queryAllByRole('status').map((s) => s.textContent)).not.toContainEqual(
      expect.stringMatching(/Added/),
    );
    expect(tagsApi.assignTag).not.toHaveBeenCalled();
  });

  it('says an archived tag is archived, not missing', async () => {
    await renderReady();
    typeAndEnter('retired');
    expect(notice()).toHaveTextContent('Retired is archived; restore it in Manage Tags.');
    expect(input()).toHaveValue('retired');
    expect(tagsApi.assignTag).not.toHaveBeenCalled();
  });

  it('is read-only and says so until the tags have loaded', async () => {
    const list = deferred<Tag[]>();
    tagsApi.listTags.mockReturnValue(list.promise);
    rtl(<TagsSection member={member} />, { wrapper: queryWrapper() });
    expect(input()).toHaveAttribute('readonly');
    expect(input()).toHaveAttribute('placeholder', 'Loading tags…');
    expect(status()).toHaveTextContent('Loading tags…');
    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Choir' }));
    list.resolve([active('t1', 'Choir'), active('t2', 'Youth')]);
    await waitFor(() => expect(input()).not.toHaveAttribute('readonly'));
    expect(status()).toHaveTextContent('');
    expect(tagsApi.unassignTag).not.toHaveBeenCalled();
    typeAndEnter('Youth');
    await waitFor(() => expect(tagsApi.assignTag).toHaveBeenCalledWith('u1', 't2'));
  });

  it('saves one change at a time: no edit while a save is pending, and no false status', async () => {
    const add = deferred<unknown>();
    tagsApi.assignTag.mockReturnValue(add.promise);
    await renderReady();
    typeAndEnter('Youth');
    await settle();
    expect(status()).toHaveTextContent('Saving…');
    expect(input()).toHaveAttribute('readonly');
    const removeYouth = screen.getByRole('button', { name: 'Remove Youth' });
    removeYouth.focus();
    fireEvent.click(removeYouth);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Choir' }));
    await settle();
    // Nothing else started, the chips stay, and focus stays on the (still enabled) button.
    expect(tagsApi.unassignTag).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove Choir' })).toBeTruthy();
    expect(removeYouth).toHaveFocus();
    expect(removeYouth).toHaveAttribute('aria-disabled', 'true');
    expect(status()).not.toHaveTextContent(/Removed/);
    add.resolve({ added: true, memberTags: [] });
    await waitFor(() => expect(status()).toHaveTextContent('Added Youth'));
    expect(input()).not.toHaveAttribute('readonly');
  });

  it('unassigns a removed chip, archived ones too, and shows a failure', async () => {
    tagsApi.unassignTag.mockRejectedValueOnce(new ApiError(500, 'Server down'));
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Old list (archived)' }));
    await waitFor(() => expect(tagsApi.unassignTag).toHaveBeenCalledWith('u1', 't9'));
    expect((await screen.findByRole('alert')).textContent).toBe('Server down');
    expect(status()).not.toHaveTextContent(/Removed/);
    // The chip is back once the failed change settles.
    expect(screen.getByRole('button', { name: 'Remove Old list (archived)' })).toBeTruthy();
  });

  it('still removes tags, and refuses adds with a reason, when the tag list fails to load', async () => {
    tagsApi.listTags.mockRejectedValue(new ApiError(500, 'Tags down'));
    await render(<TagsSection member={member} />);
    await waitFor(() => expect(input()).not.toHaveAttribute('readonly'));
    typeAndEnter('Youth');
    expect(tagsApi.assignTag).not.toHaveBeenCalled();
    expect(
      (await screen.findAllByText('Tags can be added once the tag list loads.')).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Old list (archived)' }));
    await waitFor(() => expect(tagsApi.unassignTag).toHaveBeenCalledWith('u1', 't9'));
  });
});
