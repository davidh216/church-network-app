'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
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
  /** The stored form of a typed entry (applied after trimming, before the duplicate check). */
  normalize?: (value: string) => string;
  placeholder?: string;
}

const inputClass =
  'flex-1 min-w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500';
const identity = (value: string) => value;

/**
 * A list of short labels edited as chips: type a value and press Enter or a comma (or leave the
 * field) to add it; each chip has a remove button, and Backspace in the empty field removes the
 * last one. Values are trimmed (and normalised when `normalize` is given) and a case-insensitive
 * duplicate is refused. A refused entry stays in the field with a visible notice. Chips are keyed
 * and removed by position, so duplicate stored values are handled one at a time.
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
  formatChip = identity,
  normalize = identity,
  placeholder = 'Type and press Enter',
}: ChipInputProps) {
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const removeRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // The index of a chip removed with its button, so focus can move once the parent re-renders.
  const pendingFocus = useRef<number | null>(null);
  const full = maxItems !== undefined && values.length >= maxItems;
  const hintId = `${id}-hint`;
  const noticeId = `${id}-notice`;
  const listId = suggestions ? `${id}-suggestions` : undefined;

  useEffect(() => {
    const removed = pendingFocus.current;
    if (removed === null) return;
    pendingFocus.current = null;
    // The chip that took the removed one's place, else the previous one, else the text field.
    const target =
      values.length > 0 ? removeRefs.current[Math.min(removed, values.length - 1)] : null;
    (target ?? inputRef.current)?.focus();
  }, [values]);

  const refuse = (message: string) => {
    setNotice(message);
    setAnnouncement(message);
  };

  const add = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setDraft('');
      setNotice('');
      return;
    }
    const value = normalize(trimmed);
    if (value.includes('\u0000')) return refuse(`${trimmed} contains an invalid character`);
    if (values.some((v) => v.toLowerCase() === value.toLowerCase()))
      return refuse(`${formatChip(value)} is already in the list`);
    if (full) return refuse(`At most ${maxItems} entries: remove one to add another`);
    setDraft('');
    setNotice('');
    onChange([...values, value]);
    setAnnouncement(`Added ${formatChip(value)}`);
  };

  const remove = (index: number) => {
    const value = values[index]!;
    onChange(values.filter((_, i) => i !== index));
    setAnnouncement(`Removed ${formatChip(value)}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      // Enter would otherwise submit the surrounding form.
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      remove(values.length - 1);
    }
  };

  const describedBy = [hintId, notice ? noticeId : null, error ? errorId(id) : null]
    .filter(Boolean)
    .join(' ');
  const empty = !draft.trim();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {values.length > 0 && (
        <ul aria-label={label} className="flex flex-wrap gap-2 mb-2">
          {values.map((value, index) => (
            <li
              key={`${index}:${value}`}
              className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 text-sm pl-3 pr-1 py-0.5"
            >
              {formatChip(value)}
              <button
                type="button"
                ref={(el) => {
                  removeRefs.current[index] = el;
                }}
                onClick={() => {
                  pendingFocus.current = index;
                  remove(index);
                }}
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
          ref={inputRef}
          id={id}
          type="text"
          value={draft}
          maxLength={maxLength}
          list={listId}
          onChange={(e) => {
            setDraft(e.target.value);
            setNotice('');
          }}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={inputClass}
        />
        {/* Never `disabled`: Tab from a typed entry commits it on blur, and focus must still land
            here rather than fall to the page. A click with nothing typed does nothing. */}
        <button
          type="button"
          onClick={() => add(draft)}
          aria-disabled={empty}
          aria-label={`Add to ${label}`}
          className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-hidden focus:ring-2 focus:ring-gray-500 aria-disabled:opacity-50"
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
      {notice && (
        <p id={noticeId} className="mt-1 text-sm text-amber-800">
          {notice}
        </p>
      )}
      <FieldError fieldId={id} message={error} />
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
