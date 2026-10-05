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

  it('is a modal dialog named by the video title, with labelled icon buttons', async () => {
    const items = [
      video('https://youtu.be/dQw4w9WgXcQ'),
      { ...video('https://youtu.be/dQw4w9WgXcQ'), id: 'v2' },
    ];
    await render(
      <VideoPlayer media={items[0]!} onClose={vi.fn()} playlist={items} currentIndex={0} />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Sunday sermon' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    for (const name of [
      'Toggle playlist',
      'Fullscreen',
      'Close player',
      'Previous video',
      'Next video',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole('link', { name: 'Watch on YouTube (opens in a new tab)' }),
    ).toBeInTheDocument();
  });

  it('leaves Space to a focused button instead of treating it as a shortcut', async () => {
    const onClose = vi.fn();
    await render(<VideoPlayer media={video('https://youtu.be/dQw4w9WgXcQ')} onClose={onClose} />);
    const close = screen.getByRole('button', { name: 'Close player' });
    close.focus();
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    close.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves fullscreen on Escape before closing', async () => {
    const onClose = vi.fn();
    const exitFullscreen = vi.fn();
    Object.defineProperty(document, 'exitFullscreen', {
      value: exitFullscreen,
      configurable: true,
    });
    Object.defineProperty(document, 'fullscreenElement', {
      value: document.body,
      configurable: true,
    });
    try {
      await render(<VideoPlayer media={video('https://youtu.be/dQw4w9WgXcQ')} onClose={onClose} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(exitFullscreen).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
    }
  });

  it('lists the keyboard shortcuts in a visually hidden description of the dialog', async () => {
    await render(<VideoPlayer media={video('https://youtu.be/dQw4w9WgXcQ')} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      /^Keyboard shortcuts: Space plays or pauses, F toggles fullscreen/,
    );
  });

  it('subscribes to the player state on load and toggles play and pause on Space', async () => {
    await render(
      <VideoPlayer
        media={video('https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ')}
        onClose={vi.fn()}
      />,
    );
    const iframe = screen.getByTitle('Sunday sermon') as HTMLIFrameElement;
    const player = iframe.contentWindow!;
    const postMessage = vi.spyOn(player, 'postMessage').mockImplementation(() => undefined);
    const sent = () =>
      postMessage.mock.calls.map(([message, origin]) => [JSON.parse(message as string), origin]);

    fireEvent.load(iframe);
    expect(sent()[0]).toEqual([
      { event: 'listening', id: 1, channel: 'widget' },
      'https://www.youtube.com',
    ]);

    // The player reports that it is playing: Space pauses.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: '{"event":"onStateChange","info":1}',
        origin: 'https://www.youtube.com',
        source: player,
      }),
    );
    fireEvent.keyDown(document, { key: ' ' });
    expect(sent()[1]).toEqual([
      { event: 'command', func: 'pauseVideo', args: [] },
      'https://www.youtube.com',
    ]);
    // Space again plays.
    fireEvent.keyDown(document, { key: ' ' });
    expect(sent()[2]![0]).toMatchObject({ func: 'playVideo' });

    // Messages from any other origin are ignored.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: '{"event":"onStateChange","info":2}',
        origin: 'https://evil.example',
        source: player,
      }),
    );
    fireEvent.keyDown(document, { key: ' ' });
    expect(sent()[3]![0]).toMatchObject({ func: 'pauseVideo' });
  });
});
