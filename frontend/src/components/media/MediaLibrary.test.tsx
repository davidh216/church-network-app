import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MediaLibrary from '@/components/media/MediaLibrary';
import { ApiError } from '@/lib/api/client';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { makeUser } from '@/test/fixtures';
import { render } from '@/test/render';
import type { MediaItem } from '@/types/domain';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const authApi = vi.hoisted(() => ({
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => authApi);

const mediaApi = vi.hoisted(() => ({ listMedia: vi.fn(), createMedia: vi.fn() }));
vi.mock('@/lib/api/media', () => mediaApi);

function video(n: number): MediaItem {
  return {
    id: `v${n}`,
    title: `Sermon ${n}`,
    type: 'YOUTUBE_VIDEO',
    url: `https://www.youtube.com/watch?v=abcdefghij${n}`,
    videoId: `abcdefghij${n}`,
    tags: '[]',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function mediaPage(media: MediaItem[], total = media.length, page = 1) {
  return { media, total, page, pageSize: 24 };
}

function lastParams(): Record<string, unknown> {
  return mediaApi.listMedia.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

async function renderAs(roleNames: string[]) {
  authApi.me.mockResolvedValue(makeUser(roleNames));
  return render(
    <AuthProvider>
      <MediaLibrary onPlayMedia={() => undefined} />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mediaApi.listMedia.mockResolvedValue(mediaPage([video(1), video(2)], 30));
});

describe('MediaLibrary', () => {
  it('shows the total across pages and pages on the server, 24 at a time', async () => {
    await renderAs(['member']);
    expect(lastParams()).toEqual({ search: '', tag: 'all', page: 1, pageSize: 24 });
    expect(screen.getByText('(30 videos)')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }));
  });

  it('debounces the search, keeps focus and the current videos, and resets to page 1', async () => {
    await renderAs(['member']);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }));
    const callsBefore = mediaApi.listMedia.mock.calls.length;

    const input = screen.getByPlaceholderText('Search videos...');
    input.focus();
    fireEvent.change(input, { target: { value: 'gr' } });
    fireEvent.change(input, { target: { value: 'grace' } });
    expect(mediaApi.listMedia).toHaveBeenCalledTimes(callsBefore);
    expect(screen.getByText('Sermon 1')).toBeInTheDocument();

    await waitFor(() => expect(lastParams()).toMatchObject({ search: 'grace', page: 1 }));
    expect(mediaApi.listMedia).toHaveBeenCalledTimes(callsBefore + 1);
    expect(document.activeElement).toBe(screen.getByPlaceholderText('Search videos...'));
  });

  it('says no videos match when a search finds nothing', async () => {
    await renderAs(['member']);
    mediaApi.listMedia.mockResolvedValue(mediaPage([]));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'youth' } });
    expect(await screen.findByText('No videos match your search.')).toBeInTheDocument();
    expect(lastParams()).toMatchObject({ tag: 'youth', page: 1 });
  });

  it('shows an inline error with Retry', async () => {
    mediaApi.listMedia.mockRejectedValue(new ApiError(500, 'Media unavailable'));
    await renderAs(['member']);
    expect(await screen.findByRole('alert')).toHaveTextContent('Media unavailable');
    mediaApi.listMedia.mockResolvedValue(mediaPage([video(3)]));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Sermon 3')).toBeInTheDocument();
  });

  it('refetches the library after staff add a video', async () => {
    mediaApi.createMedia.mockResolvedValue(video(9));
    await renderAs(['admin']);
    const callsBefore = mediaApi.listMedia.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Add Video/ }));
    fireEvent.change(screen.getByPlaceholderText('Sunday Service - January 2025'), {
      target: { value: 'New sermon' },
    });
    fireEvent.change(screen.getByPlaceholderText('https://www.youtube.com/watch?v=...'), {
      target: { value: 'https://www.youtube.com/watch?v=abcdefghijk' },
    });
    await act(async () => {
      fireEvent.submit(
        screen.getByPlaceholderText('Sunday Service - January 2025').closest('form')!,
      );
    });
    expect(mediaApi.createMedia).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New sermon', type: 'YOUTUBE_VIDEO' }),
    );
    await waitFor(() => expect(mediaApi.listMedia.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(screen.queryByText('Add YouTube Video')).not.toBeInTheDocument();
  });

  it('opens Add Video as a labelled modal dialog that Escape closes', async () => {
    await renderAs(['admin']);
    fireEvent.click(screen.getByRole('button', { name: /Add Video/ }));
    const dialog = screen.getByRole('dialog', { name: 'Add YouTube Video' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.activeElement).toBe(screen.getByLabelText('Video Title *'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('gives every play control and the view switch an accessible name', async () => {
    await renderAs(['member']);
    expect(await screen.findByRole('button', { name: 'Play Sermon 1' })).toBeInTheDocument();
    const grid = screen.getByRole('button', { name: 'Grid View' });
    expect(grid).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'List View' }));
    expect(screen.getByRole('button', { name: 'List View' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Play Sermon 1' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open Sermon 1 on YouTube (opens in a new tab)' }),
    ).toBeInTheDocument();
  });
});
