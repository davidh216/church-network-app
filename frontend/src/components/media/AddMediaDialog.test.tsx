import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddMediaDialog from '@/components/media/AddMediaDialog';
import { ApiError } from '@/lib/api/client';
import { render, settle } from '@/test/render';

const mediaApi = vi.hoisted(() => ({ listMedia: vi.fn(), createMedia: vi.fn() }));
vi.mock('@/lib/api/media', () => mediaApi);

const URL_MESSAGE =
  'Must be an https:// YouTube watch or youtu.be link with an 11-character video id';

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Add Video' }));
  await settle();
}

const onSaved = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
});

describe('AddMediaDialog', () => {
  it('sends the canonical watch URL from the shared schema', async () => {
    mediaApi.createMedia.mockResolvedValue({});
    await render(<AddMediaDialog onClose={() => undefined} onSaved={onSaved} />);
    type('Video Title *', '  New sermon ');
    type('YouTube URL *', 'https://youtu.be/abcdefghijk?t=30');
    const tags = screen.getByRole('combobox', { name: 'Tags' });
    fireEvent.change(tags, { target: { value: 'sermon' } });
    fireEvent.keyDown(tags, { key: 'Enter' });
    fireEvent.change(tags, { target: { value: ' Easter 2026 ' } });
    fireEvent.keyDown(tags, { key: ',' });
    expect(screen.getByRole('button', { name: 'Remove Sermon' })).toBeTruthy();
    await submit();
    expect(mediaApi.createMedia).toHaveBeenCalledWith({
      title: 'New sermon',
      description: '',
      type: 'YOUTUBE_VIDEO',
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
      tags: ['sermon', 'Easter 2026'],
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it.each([
    'https://example.com/watch?v=abcdefghijk',
    'http://www.youtube.com/watch?v=abcdefghijk',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/embed/abcdefghijk',
  ])('rejects %s inline with the API message', async (url) => {
    await render(<AddMediaDialog onClose={() => undefined} onSaved={onSaved} />);
    type('Video Title *', 'New sermon');
    type('YouTube URL *', url);
    await submit();
    expect(mediaApi.createMedia).not.toHaveBeenCalled();
    expect(screen.getByLabelText('YouTube URL *')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('YouTube URL *')).toHaveAccessibleDescription(URL_MESSAGE);
  });

  it('flags a blank title without calling the API', async () => {
    await render(<AddMediaDialog onClose={() => undefined} onSaved={onSaved} />);
    type('Video Title *', '   ');
    type('YouTube URL *', 'https://www.youtube.com/watch?v=abcdefghijk');
    await submit();
    expect(mediaApi.createMedia).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Video Title *')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Video Title *')).toHaveAccessibleDescription(
      'Please enter a title',
    );
    expect(screen.getByLabelText('YouTube URL *')).not.toHaveAttribute('aria-invalid');
  });

  it('shows a non-field API error as an alert and stays open', async () => {
    mediaApi.createMedia.mockRejectedValue(new ApiError(403, 'Insufficient permissions'));
    await render(<AddMediaDialog onClose={() => undefined} onSaved={onSaved} />);
    type('Video Title *', 'New sermon');
    type('YouTube URL *', 'https://www.youtube.com/watch?v=abcdefghijk');
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent('Insufficient permissions');
    expect(onSaved).not.toHaveBeenCalled();
  });
});
