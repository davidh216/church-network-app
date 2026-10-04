// B3 (item 1.12): every visible control does something, and nothing advertises features
// that do not exist yet.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Home from '@/app/page';
import SimpleMediaLibrary from '@/components/media/SimpleMediaLibrary';
import VideoPlayer from '@/components/media/VideoPlayer';
import BulkActionsToolbar from '@/components/members/BulkActionsToolbar';
import MemberList from '@/components/members/MemberList';
import SavedSearches from '@/components/members/SavedSearches';
import { ApiError } from '@/lib/api/client';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { makeUser } from '@/test/fixtures';
import { buttonTexts, render, settle, type Rendered } from '@/test/render';
import type { MediaItem, Member } from '@/types/domain';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const authApi = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn() }));
vi.mock('@/lib/api/auth', () => authApi);

const usersApi = vi.hoisted(() => ({ listUsers: vi.fn(), exportUsers: vi.fn() }));
vi.mock('@/lib/api/users', () => usersApi);

const mediaApi = vi.hoisted(() => ({ listMedia: vi.fn(), createMedia: vi.fn() }));
vi.mock('@/lib/api/media', () => mediaApi);

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
  { id: 'm1', name: 'Ann Example', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', roles: [] },
];

function video(n: number): MediaItem {
  return {
    id: `v${n}`,
    title: `Sermon ${n}`,
    type: 'YOUTUBE_VIDEO',
    url: `https://www.youtube.com/watch?v=abc${n}`,
    tags: '[]',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}
const playlist = [video(1), video(2), video(3)];

let rendered: Rendered | undefined;
async function renderAs(roleNames: string[], ui: React.ReactNode) {
  authApi.me.mockResolvedValue(makeUser(roleNames));
  rendered = await render(<AuthProvider>{ui}</AuthProvider>);
  return rendered.container;
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
  usersApi.listUsers.mockResolvedValue(staffRows);
  mediaApi.listMedia.mockResolvedValue([]);
  savedSearchesApi.listSavedSearches.mockResolvedValue([]);
});

afterEach(() => {
  rendered?.unmount();
  rendered = undefined;
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
    const v3Only = /\b(bg|text|border|ring|divide|placeholder)-opacity-\d+|\bflex-shrink(-\d+)?\b|\bflex-grow(-\d+)?\b/;
    const offenders = sourceFiles(join(__dirname, '..')).filter((file) =>
      v3Only.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

describe('VideoPlayer playlist', () => {
  it('renders playlist items as buttons that call onSelect with their index', async () => {
    const onSelect = vi.fn();
    rendered = await render(
      <VideoPlayer media={playlist[0]!} onClose={noop} playlist={playlist} currentIndex={0} onSelect={onSelect} />,
    );
    const { container } = rendered;
    await act(async () => container.querySelector<HTMLButtonElement>('button[title="Toggle Playlist"]')!.click());

    const items = Array.from(container.querySelectorAll('button')).filter((b) =>
      (b.textContent ?? '').includes('Sermon'),
    );
    expect(items).toHaveLength(3);
    await act(async () => items[2]!.click());
    expect(onSelect).toHaveBeenCalledWith(2);
    await act(async () => items[0]!.click()); // the current item: nothing to switch to
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('switches the playing video when a playlist item is chosen on the dashboard', async () => {
    mediaApi.listMedia.mockResolvedValue(playlist);
    const container = await renderAs(['member'], <Home />);
    await act(async () => button(container, 'Media Library').click());
    await settle();
    // Play the first video, then pick the third from the playlist.
    const play = container.querySelectorAll<HTMLButtonElement>('.group > button')[0]!;
    await act(async () => play.click());
    expect(container.querySelector('iframe')?.title).toBe('Sermon 1');
    await act(async () => container.querySelector<HTMLButtonElement>('button[title="Toggle Playlist"]')!.click());
    await act(async () => button(container.querySelector('.playlist-scrollbar')!, 'Sermon 3').click());
    expect(container.querySelector('iframe')?.title).toBe('Sermon 3');
    expect(container.textContent).toContain('3 of 3');
  });
});

describe('media thumbnails', () => {
  it('hides a thumbnail whose fallbacks fail instead of loading a dead placeholder host', async () => {
    mediaApi.listMedia.mockResolvedValue([video(1)]);
    const container = await renderAs(['member'], <SimpleMediaLibrary onPlayMedia={noop} />);
    const img = container.querySelector('img')!;
    expect(img.src).toContain('img.youtube.com');
    await act(async () => img.dispatchEvent(new Event('error')));
    expect(img.src).toContain('hqdefault.jpg');
    await act(async () => img.dispatchEvent(new Event('error')));
    expect(img.style.visibility).toBe('hidden');
    expect(container.innerHTML).not.toContain('placeholder.com');
  });
});

describe('dashboard', () => {
  it('has no placeholder actions or hard-coded overview', async () => {
    const container = await renderAs(['admin'], <Home />);
    const text = container.textContent ?? '';
    expect(text).toContain('Your Profile');
    expect(text).not.toContain('Upcoming Events');
    expect(text).not.toContain('Slack Workspace');
    expect(text).not.toContain('Membership Overview');
    expect(text).not.toContain('Active System');
    expect(buttonTexts(container).filter((b) => b.includes('Members') || b.includes('Media'))).toEqual([
      '👥 View Members',
      '🎵 Media Library',
    ]);
  });
});

describe('BulkActionsToolbar', () => {
  it('offers only CSV export and clearing the selection', async () => {
    const onExport = vi.fn();
    const onClear = vi.fn();
    rendered = await render(<BulkActionsToolbar selectedCount={2} onExport={onExport} onClearSelection={onClear} />);
    const { container } = rendered;
    expect(buttonTexts(container)).toEqual(['Export CSV', 'Clear Selection']);
    expect(container.textContent).not.toMatch(/Excel|Tags|Email Campaign|Create Group|Print Labels|Reports|Bulk Update/);
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

  it('hides Advanced Search and Saved Searches until the evaluator exists', async () => {
    const container = await renderAs(['admin'], (
      <MemberList onEditMember={noop} onAddMember={noop} refreshTrigger={0} />
    ));
    const buttons = buttonTexts(container);
    expect(buttons).not.toContain('Advanced Search');
    expect(buttons).not.toContain('Saved Searches');
  });

  it('downloads the CSV under the server-provided filename', async () => {
    const createObjectURL = vi.fn(() => 'blob:members');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
    usersApi.exportUsers.mockResolvedValue({ blob: new Blob(['a,b']), filename: 'members-2026-10-04.csv' });

    const container = await renderAs(['admin'], (
      <MemberList onEditMember={noop} onAddMember={noop} refreshTrigger={0} />
    ));
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
    const container = await renderAs(['admin'], (
      <MemberList onEditMember={noop} onAddMember={noop} refreshTrigger={0} />
    ));
    await selectFirstRow(container);
    await act(async () => button(container, 'Export Selected (1)').click());
    await settle();

    const toast = container.querySelector('[role="alert"]');
    expect(toast?.textContent).toContain('Insufficient permissions');
    await act(async () => toast!.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')!.click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows members only the directory columns and filters', async () => {
    usersApi.listUsers.mockResolvedValue(directoryRows);
    const container = await renderAs(['member'], (
      <MemberList onEditMember={noop} onAddMember={noop} refreshTrigger={0} />
    ));
    expect(headers(container)).toEqual(['Member', 'Role', 'Joined']);
    expect(container.textContent).not.toContain('Inactive');
    expect(container.querySelectorAll('select')).toHaveLength(1); // roles only
  });

  it('shows staff the contact, engagement, stage and status columns', async () => {
    const container = await renderAs(['leader'], (
      <MemberList onEditMember={noop} onAddMember={noop} refreshTrigger={0} />
    ));
    expect(headers(container)).toEqual(['', 'Member', 'Contact', 'Role', 'Engagement', 'Stage', 'Status', 'Joined', 'Actions']);
    expect(container.querySelectorAll('select').length).toBeGreaterThan(1);
  });
});

describe('SavedSearches', () => {
  it('does not offer the predefined quick searches', async () => {
    const container = await renderAs(['admin'], (
      <SavedSearches onLoadSearch={noop} onClose={noop} currentQuery={null} />
    ));
    expect(container.textContent).toContain('Your Saved Searches');
    expect(container.textContent).not.toContain('Quick Searches');
    expect(container.textContent).not.toContain('High Engagement Members');
  });
});
