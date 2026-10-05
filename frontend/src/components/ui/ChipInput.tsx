'use client';

import { useState, type KeyboardEvent } from 'react';
import { errorId } from '@/lib/forms/validate';
import FieldError from './FieldError';

interface ChipInputProps {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  /** The field's inline validation message, if any. */
  error?: string;
  /** Entries beyond this are refused with a hint (the schema enforces it again on save). */
  maxItems?: number;
  /** Longest entry, as the API allows. */
  maxLength?: number;
  /** Values offered as the user types (a datalist); free text is still allowed. */
  suggestions?: readonly string[];
  /** How a value is shown on its chip (the stored value is unchanged). */
  formatChip?: (value: string) => string;
  placeholder?: string;
}

const inputClass =
  'flex-1 min-w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500';

/**
 * A list of short labels edited as chips: type a value and press Enter or a comma (or leave the
 * field) to add it; each chip has a remove button, and Backspace in the empty field removes the
 * last one. Values are trimmed and a case-insensitive duplicate is ignored.
 */
export default function ChipInput({
  id,
  label,
  values,
  onChange,
  error,
  maxItems,
  maxLength = 50,
  suggestions,
  formatChip = (value) => value,
  placeholder = 'Type and press Enter',
}: ChipInputProps) {
  const [draft, setDraft] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const full = maxItems !== undefined && values.length >= maxItems;
  const hintId = `${id}-hint`;
  const listId = suggestions ? `${id}-suggestions` : undefined;

  const add = (raw: string) => {
    const value = raw.trim();
    setDraft('');
    if (!value) return;
    if (values.some((v) => v.toLowerCase() === value.toLowerCase())) {
      setAnnouncement(`${value} is already in the list`);
      return;
    }
    if (full) {
      setAnnouncement(`At most ${maxItems} entries`);
      return;
    }
    onChange([...values, value]);
    setAnnouncement(`Added ${value}`);
  };

  const remove = (value: string) => {
    onChange(values.filter((v) => v !== value));
    setAnnouncement(`Removed ${value}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      // Enter would otherwise submit the surrounding form.
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      remove(values[values.length - 1]!);
    }
  };

  const describedBy = [hintId, error ? errorId(id) : null].filter(Boolean).join(' ');
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {values.length > 0 && (
        <ul aria-label={label} className="flex flex-wrap gap-2 mb-2">
          {values.map((value) => (
            <li
              key={value}
              className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 text-sm pl-3 pr-1 py-0.5"
            >
              {formatChip(value)}
              <button
                type="button"
                onClick={() => remove(value)}
                aria-label={`Remove ${formatChip(value)}`}
                className="ml-1 rounded-full px-1.5 hover:bg-blue-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={draft}
          maxLength={maxLength}
          list={listId}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={!draft.trim()}
          aria-label={`Add to ${label}`}
          className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-hidden focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      <p id={hintId} className="mt-1 text-xs text-gray-500">
        Press Enter or a comma to add{maxItems !== undefined ? `, up to ${maxItems}` : ''}.
      </p>
      <FieldError fieldId={id} message={error} />
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
