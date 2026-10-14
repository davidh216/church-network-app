'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createTagInput, DEFAULT_TAG_COLOR, TAG_CATEGORIES, type Tag } from '@embrace/shared';
import {
  apiErrorsFor,
  fieldA11y,
  FORM_ERROR_KEY,
  validateForm,
  type FieldErrors,
} from '@/lib/forms/validate';
import { enumOptions } from '@/lib/members/display';
import { useCreateTag, useUpdateTag } from '@/lib/queries/tags';
import FieldError from '@/components/ui/FieldError';
import TextField from '@/components/ui/TextField';

interface TagFormProps {
  /** The tag to edit; without it the form creates one. */
  tag?: Tag;
  onDone: () => void;
  onCancel: () => void;
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const FIELDS = ['name', 'color', 'category'] as const;
const CATEGORY_OPTIONS = enumOptions(TAG_CATEGORIES);

/**
 * Creates or edits a tag: name (unique ignoring case), colour and category. An edit sends only
 * what changed. A failed save focuses the first invalid field, or the message.
 */
export default function TagForm({ tag, onDone, onCancel }: TagFormProps) {
  const [form, setForm] = useState({
    name: tag?.name ?? '',
    color: tag?.color ?? DEFAULT_TAG_COLOR,
    category: tag?.category ?? 'general',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [failures, setFailures] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const saving = createTag.isPending || updateTag.isPending;

  useEffect(() => {
    if (failures === 0) return;
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalid ?? alertRef.current)?.focus();
  }, [failures]);

  const fail = (errors: FieldErrors, message: string) => {
    setFieldErrors(errors);
    setError(message);
    setFailures((n) => n + 1);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // The button stays enabled while saving (disabling it would drop the focus to the page).
    if (saving) return;
    const checked = validateForm(createTagInput, form);
    if (!checked.ok) {
      fail(checked.errors, checked.errors[FORM_ERROR_KEY] ?? '');
      return;
    }
    const data = checked.data;
    try {
      if (tag) {
        const changes = Object.fromEntries(
          FIELDS.filter((key) => data[key] !== tag[key]).map((key) => [key, data[key]]),
        );
        if (Object.keys(changes).length > 0)
          await updateTag.mutateAsync({ id: tag.id, input: changes });
      } else {
        await createTag.mutateAsync(data);
      }
      onDone();
    } catch (err: unknown) {
      const failed = apiErrorsFor(err, FIELDS, 'Failed to save the tag');
      fail(failed.fieldErrors, failed.message);
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      aria-label={tag ? `Edit tag ${tag.name}` : 'New tag'}
      className="space-y-3 rounded-md border border-gray-200 p-3"
    >
      {error && (
        <div
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          className="p-2 bg-red-100 border border-red-400 text-red-700 rounded-sm text-sm"
        >
          {error}
        </div>
      )}
      <TextField
        id="tag-name"
        label="Name *"
        value={form.name}
        maxLength={40}
        onChange={(name) => setForm((prev) => ({ ...prev, name }))}
        error={fieldErrors.name}
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="tag-color" className={labelClass}>
            Colour
          </label>
          <input
            id="tag-color"
            type="color"
            value={form.color}
            onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
            className="h-10 w-full rounded-md border border-gray-300"
            {...fieldA11y('tag-color', fieldErrors.color)}
          />
          <FieldError fieldId="tag-color" message={fieldErrors.color} />
        </div>
        <div>
          <label htmlFor="tag-category" className={labelClass}>
            Category
          </label>
          <select
            id="tag-category"
            value={form.category}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, category: e.target.value as Tag['category'] }))
            }
            className={inputClass}
            {...fieldA11y('tag-category', fieldErrors.category)}
          >
            {CATEGORY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <FieldError fieldId="tag-category" message={fieldErrors.category} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-hidden focus:ring-2 focus:ring-gray-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          aria-disabled={saving || undefined}
          className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 aria-disabled:opacity-50"
        >
          {saving ? 'Saving...' : tag ? 'Save Tag' : 'Create Tag'}
        </button>
      </div>
    </form>
  );
}
