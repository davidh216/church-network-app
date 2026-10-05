import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VideoPlayer from '@/components/media/VideoPlayer';
import { render } from '@/test/render';
import type { MediaItem } from '@/types/domain';

function video(url: string, videoId: string | null = null): MediaItem {
  return {
    id: 'v1',
    title: 'Sunday sermon',
    type: 'YOUTUBE_VIDEO',
    url,
    videoId,
    tags: '["worship","youth","prayer"]',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('VideoPlayer', () => {
  it('embeds a valid YouTube id through the privacy embed URL', async () => {
    await render(
      <VideoPlayer
        media={video('https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ')}
        onClose={vi.fn()}
      />,
    );
    const iframe = screen.getByTitle('Sunday sermon') as HTMLIFrameElement;
    expect(iframe.src.startsWith('https://www.youtube.com/embed/dQw4w9WgXcQ?')).toBe(true);
  });

  it('never puts a stored URL that fails the strict id check into the iframe', async () => {
    const { container } = await render(
      <VideoPlayer media={video('https://evil.example/watch?v=dQw4w9WgXcQ')} onClose={vi.fn()} />,
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByText('This video cannot be played here.')).toBeTruthy();
  });

  it('closes on Escape and from the close button', async () => {
    const onClose = vi.fn();
    await render(<VideoPlayer media={video('https://youtu.be/dQw4w9WgXcQ')} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByTitle('Close (Esc)'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('pages through the playlist with the previous and next controls', async () => {
    const onPlayNext = vi.fn();
    const onPlayPrevious = vi.fn();
    const items = [
      video('https://youtu.be/dQw4w9WgXcQ'),
      { ...video('https://youtu.be/dQw4w9WgXcQ'), id: 'v2' },
    ];
    await render(
      <VideoPlayer
        media={items[0]!}
        onClose={vi.fn()}
        playlist={items}
        currentIndex={0}
        onPlayNext={onPlayNext}
        onPlayPrevious={onPlayPrevious}
      />,
    );
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect((screen.getByTitle('Previous (←)') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTitle('Next (→)'));
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(onPlayNext).toHaveBeenCalledTimes(2);
    expect(onPlayPrevious).not.toHaveBeenCalled();
  });
});
