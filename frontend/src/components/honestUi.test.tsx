// B3 (item 1.12): every visible control does something, and nothing advertises features
// that do not exist yet.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MediaPage from '@/components/media/MediaPage';
import VideoThumbnail from '@/components/media/VideoThumbnail';
import MediaLibrary from '@/components/media/MediaLibrary';
import VideoPlayer from '@/components/media/VideoPlayer';
import BulkActionsToolbar from '@/components/members/BulkActionsToolbar';
import MemberList from '@/components/members/MemberList';
import SavedSearches from '@/components/members/SavedSearches';
import { ApiError } from '@/lib/api/client';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { makeUser } from '@/test/fixtures';
import { buttonTexts, render, settle } from '@/test/render';
import type { MediaItem, Member } from '@/types/domain';

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

const mediaApi = vi.hoisted(() => ({ listMedia: vi.fn(), createMedia: vi.fn() }));
vi.mock('@/lib/api/media', () => mediaApi);

// GET /api/users and /api/media return one page plus the total (Phase 2 spec 1.2).
const usersPage = (users: unknown[]) => ({ users, total: users.length, page: 1, pageSize: 25 });
const mediaPage = (media: unknown[]) => ({ media, total: media.length, page: 1, pageSize: 24 });

const savedSearchesApi = vi.hoisted(() => ({
  listSavedSearches: vi.fn(),
  createSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
  useSavedSearch: vi.fn(),
}));
vi.mock('@/lib/api/savedSearches', () => savedSearchesApi);

const staffRows: Member[] = [
  {
    id: 'm1',
    name: 'Ann Example',
    email: 'ann@example.com',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    roles: [],
    engagement: null,
  },
];
const directoryRows: Member[] = [
  {
    id: 'm1',
    name: 'Ann Example',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    roles: [],
  },
];

function video(n: number): MediaItem {
  return {
    id: `v${n}`,
    title: `Sermon ${n}`,
    type: 'YOUTUBE_VIDEO',
    url: `https://www.youtube.com/watch?v=abcdefghij${n}`,
    tags: '[]',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}
const playlist = [video(1), video(2), video(3)];

async function renderAs(roleNames: string[], ui: React.ReactNode) {
  authApi.me.mockResolvedValue(makeUser(roleNames));
  const { container } = await render(<AuthProvider>{ui}</AuthProvider>);
  return container;
}

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  );
  if (!found) throw new Error(`no button containing "${text}"`);
  return found;
}

function headers(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('th')).map((th) => (th.textContent ?? '').trim());
}

beforeEach(() => {
  vi.resetAllMocks();
  usersApi.listUsers.mockResolvedValue(usersPage(staffRows));
  mediaApi.listMedia.mockResolvedValue(mediaPage([]));
  savedSearchesApi.listSavedSearches.mockResolvedValue([]);
});

const noop = () => undefined;

describe('Tailwind v4 utilities', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(tsx|ts|css)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
    });
  }

  it('uses no v3-only opacity, flex-shrink or flex-grow utilities', () => {
    const v3Only =
      /\b(bg|text|border|ring|divide|placeholder)-opacity-\d+|\bflex-shrink(-\d+)?\b|\bflex-grow(-\d+)?\b/;
    const offenders = sourceFiles(join(__dirname, '..')).filter((file) =>
      v3Only.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

describe('VideoPlayer playlist', () => {
  it('renders playlist items as buttons that call onSelect with their index', async () => {
    const onSelect = vi.fn();
    const rendered = await render(
      <VideoPlayer
        media={playlist[0]!}
        onClose={noop}
        playlist={playlist}
        currentIndex={0}
        onSelect={onSelect}
      />,
    );
    const { container } = rendered;
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[title="Toggle Playlist"]')!.click(),
    );

    const items = Array.from(container.querySelectorAll('button')).filter((b) =>
      (b.textContent ?? '').includes('Sermon'),
    );
    expect(items).toHaveLength(3);
    await act(async () => items[2]!.click());
    expect(onSelect).toHaveBeenCalledWith(2);
    await act(async () => items[0]!.click()); // the current item: nothing to switch to
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('switches the playing video when a playlist item is chosen on the media page', async () => {
    mediaApi.listMedia.mockResolvedValue(mediaPage(playlist));
    const container = await renderAs(['member'], <MediaPage />);
    // Play the first video, then pick the third from the playlist.
    const play = container.querySelectorAll<HTMLButtonElement>('.group > button')[0]!;
    await act(async () => play.click());
    expect(container.querySelector('iframe')?.title).toBe('Sermon 1');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[title="Toggle Playlist"]')!.click(),
    );
    await act(async () =>
      button(container.querySelector('.playlist-scrollbar')!, 'Sermon 3').click(),
    );
    expect(container.querySelector('iframe')?.title).toBe('Sermon 3');
    expect(container.textContent).toContain('3 of 3');
  });
});

describe('media thumbnails', () => {
  it('loads hqdefault thumbnails from i.ytimg.com through next/image and hides one that fails', async () => {
    mediaApi.listMedia.mockResolvedValue(mediaPage([video(1)]));
    const container = await renderAs(['member'], <MediaLibrary onPlayMedia={noop} />);
    const img = () => container.querySelector('img');
    const src = () => decodeURIComponent(img()!.getAttribute('src')!);
    // next/image serves the remote file through its optimiser (/_next/image?url=...). Grid
    // cards use hqdefault, which every video has (maxresdefault is poster-only).
    expect(src()).toContain('/_next/image?url=https://i.ytimg.com/vi/abcdefghij1/hqdefault.jpg');
    await act(async () => img()!.dispatchEvent(new Event('error')));
    expect(img()).toBeNull();
    expect(container.innerHTML).not.toContain('placeholder.com');
  });
});

describe('BulkActionsToolbar', () => {
  it('offers only CSV export and clearing the selection', async () => {
    const onExport = vi.fn();
    const onClear = vi.fn();
    const rendered = await render(
      <BulkActionsToolbar selectedCount={2} onExport={onExport} onClearSelection={onClear} />,
    );
    const { container } = rendered;
    expect(buttonTexts(container)).toEqual(['Export CSV', 'Clear Selection']);
    expect(container.textContent).not.toMatch(
      /Excel|Tags|Email Campaign|Create Group|Print Labels|Reports|Bulk Update/,
    );
    await act(async () => button(container, 'Export CSV').click());
    await act(async () => button(container, 'Clear Selection').click());
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('MemberList', () => {
  async function selectFirstRow(container: HTMLElement) {
    const rowCheckbox = container.querySelector<HTMLInputElement>('tbody input[type="checkbox"]')!;
    await act(async () => rowCheckbox.click());
  }

  it('offers Advanced Search and Saved Searches to staff only (the search API is staff-only)', async () => {
    const staff = await renderAs(['admin'], <MemberList />);
    expect(buttonTexts(staff)).toEqual(
      expect.arrayContaining(['Advanced Search', 'Saved Searches']),
    );
    staff.remove();

    usersApi.listUsers.mockResolvedValue(usersPage(directoryRows));
    const member = await renderAs(['member'], <MemberList />);
    expect(buttonTexts(member)).not.toContain('Advanced Search');
    expect(buttonTexts(member)).not.toContain('Saved Searches');
  });

  it('downloads the CSV under the server-provided filename', async () => {
    const createObjectURL = vi.fn(() => 'blob:members');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });
    usersApi.exportUsers.mockResolvedValue({
      blob: new Blob(['a,b']),
      filename: 'members-2026-10-04.csv',
    });

    const container = await renderAs(['admin'], <MemberList />);
    await selectFirstRow(container);
    await act(async () => button(container, 'Export CSV').click());
    await settle();

    expect(usersApi.exportUsers).toHaveBeenCalledWith(['m1']);
    expect(click).toHaveBeenCalledTimes(1);
    expect(clicked).toEqual(['members-2026-10-04.csv']);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:members');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows a dismissible error toast when the export fails', async () => {
    usersApi.exportUsers.mockRejectedValue(new ApiError(403, 'Insufficient permissions'));
    const container = await renderAs(['admin'], <MemberList />);
    await selectFirstRow(container);
    await act(async () => button(container, 'Export Selected (1)').click());
    await settle();

    const toast = container.querySelector('[role="alert"]');
    expect(toast?.textContent).toContain('Insufficient permissions');
    await act(async () =>
      toast!.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')!.click(),
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows members only the directory columns and filters', async () => {
    usersApi.listUsers.mockResolvedValue(usersPage(directoryRows));
    const container = await renderAs(['member'], <MemberList />);
    expect(headers(container)).toEqual(['Member', 'Role', 'Joined']);
    expect(container.textContent).not.toContain('Inactive');
    // The API lets members search by name only, so no filter selects are offered.
    expect(container.querySelectorAll('select[aria-label]')).toHaveLength(0);
  });

  it('shows staff the contact, engagement, stage and status columns', async () => {
    const container = await renderAs(['leader'], <MemberList />);
    expect(headers(container)).toEqual([
      '',
      'Member',
      'Contact',
      'Role',
      'Engagement',
      'Stage',
      'Status',
      'Joined',
      'Actions',
    ]);
    expect(container.querySelectorAll('select').length).toBeGreaterThan(1);
  });
});

describe('SavedSearches', () => {
  it('offers the predefined quick searches now that the search runs on the server', async () => {
    const container = await renderAs(
      ['admin'],
      <SavedSearches onLoadSearch={noop} onClose={noop} currentQuery={null} />,
    );
    expect(container.textContent).toContain('Your Saved Searches');
    expect(container.textContent).toContain('Quick Searches');
    expect(container.textContent).toContain('High Engagement Members');
    // Nothing to save without a current query.
    expect(buttonTexts(container)).not.toContain('Save Current Search');
  });
});

describe('VideoThumbnail', () => {
  it('falls back from maxresdefault to hqdefault for a poster-sized image', async () => {
    const { container } = await render(
      <VideoThumbnail videoId="abcdefghij1" alt="Poster" large sizes="100vw" />,
    );
    const src = () => decodeURIComponent(container.querySelector('img')!.getAttribute('src')!);
    expect(src()).toContain('/vi/abcdefghij1/maxresdefault.jpg');
    await act(async () => container.querySelector('img')!.dispatchEvent(new Event('error')));
    expect(src()).toContain('/vi/abcdefghij1/hqdefault.jpg');
  });
});
