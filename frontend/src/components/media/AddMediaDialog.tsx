'use client';

import { useId, useState, type FormEvent, type RefObject } from 'react';
import { createMediaInput, MAX_MEDIA_TAGS, normalizeMediaTag } from '@embrace/shared';
import {
  apiErrorsFor,
  fieldA11y,
  FORM_ERROR_KEY,
  validateForm,
  type FieldErrors,
} from '@/lib/forms/validate';
import { MEDIA_TAGS, tagLabel } from '@/lib/media/format';
import { useCreateMedia } from '@/lib/queries/media';
import ChipInput from '@/components/ui/ChipInput';
import Dialog from '@/components/ui/Dialog';
import FieldError from '@/components/ui/FieldError';

interface AddMediaDialogProps {
  onClose: () => void;
  /** Called after the video is created (the media queries are already invalidated). */
  onSaved: () => void;
  /** Focused on close when the button that opened the dialog is gone (the page heading). */
  fallbackFocus?: RefObject<HTMLElement | null>;
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const FIELDS = ['title', 'url', 'description', 'tags'] as const;

/** Staff form for adding a YouTube video to the library. */
export default function AddMediaDialog({ onClose, onSaved, fallbackFocus }: AddMediaDialogProps) {
  const [form, setForm] = useState({ title: '', description: '', url: '', tags: [] as string[] });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const createMedia = useCreateMedia();
  const loading = createMedia.isPending;
  const titleId = useId();

  const update = (key: 'title' | 'description' | 'url', value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // The API's createMediaInput: same YouTube URL rule and messages; sends the canonical URL.
    const checked = validateForm(createMediaInput, { ...form, type: 'YOUTUBE_VIDEO' });
    if (!checked.ok) {
      setFieldErrors(checked.errors);
      setError(checked.errors[FORM_ERROR_KEY] ?? '');
      return;
    }
    setFieldErrors({});
    setError('');
    try {
      await createMedia.mutateAsync(checked.data);
      onSaved();
    } catch (err: unknown) {
      const failed = apiErrorsFor(err, FIELDS, 'Failed to add the video');
      setFieldErrors(failed.fieldErrors);
      setError(failed.message);
    }
  };

  return (
    <Dialog labelledBy={titleId} onClose={onClose} fallbackFocus={fallbackFocus}>
      <div>
        <h2 id={titleId} className="text-lg font-medium text-gray-900 mb-4">
          Add YouTube Video
        </h2>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-sm"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="media-title" className={labelClass}>
              Video Title *
            </label>
            <input
              id="media-title"
              {...fieldA11y('media-title', fieldErrors.title)}
              type="text"
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              required
              className={inputClass}
              placeholder="Sunday Service - January 2025"
            />
            <FieldError fieldId="media-title" message={fieldErrors.title} />
          </div>

          <div>
            <label htmlFor="media-url" className={labelClass}>
              YouTube URL *
            </label>
            <input
              id="media-url"
              {...fieldA11y('media-url', fieldErrors.url)}
              type="url"
              value={form.url}
              onChange={(e) => update('url', e.target.value)}
              required
              className={inputClass}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            <FieldError fieldId="media-url" message={fieldErrors.url} />
            <p className="text-xs text-gray-500 mt-1">
              Paste the URL from your Embrace Church YouTube channel
            </p>
          </div>

          <div>
            <label htmlFor="media-description" className={labelClass}>
              Description
            </label>
            <textarea
              id="media-description"
              {...fieldA11y('media-description', fieldErrors.description)}
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              rows={3}
              className={inputClass}
              placeholder="Brief description of the video content..."
            />
            <FieldError fieldId="media-description" message={fieldErrors.description} />
          </div>

          <ChipInput
            id="media-tags"
            label="Tags"
            values={form.tags}
            onChange={(tags) => setForm((prev) => ({ ...prev, tags }))}
            error={fieldErrors.tags}
            maxItems={MAX_MEDIA_TAGS}
            suggestions={MEDIA_TAGS}
            formatChip={tagLabel}
            normalize={normalizeMediaTag}
            placeholder="worship, sermon, youth..."
          />

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-hidden focus:ring-2 focus:ring-gray-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Video'}
            </button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
