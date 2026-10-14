'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import {
  createGroupInput,
  GROUP_TYPES,
  MAX_GROUP_LOCATION,
  MAX_GROUP_NAME,
  MAX_MEETING_DAY,
  MAX_MEETING_TIME,
  type GroupType,
  type StaffGroupSummary,
} from '@embrace/shared';
import {
  apiErrorsFor,
  fieldA11y,
  FORM_ERROR_KEY,
  validateForm,
  type FieldErrors,
} from '@/lib/forms/validate';
import { enumOptions } from '@/lib/members/display';
import { useCreateGroup, useUpdateGroup } from '@/lib/queries/groups';
import Dialog from '@/components/ui/Dialog';
import FieldError from '@/components/ui/FieldError';
import TextField from '@/components/ui/TextField';

interface GroupDialogProps {
  /** The group to edit; without it the dialog creates one. */
  group?: StaffGroupSummary;
  onClose: () => void;
  /** Called with the saved group (the group queries are already invalidated). */
  onSaved: (group: StaffGroupSummary) => void;
  fallbackFocus?: RefObject<HTMLElement | null>;
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const FIELDS = ['name', 'type', 'description', 'meetingDay', 'meetingTime', 'location'] as const;
const TYPE_OPTIONS = enumOptions(GROUP_TYPES);

type Form = Record<(typeof FIELDS)[number], string>;

/**
 * Staff form for creating or editing a group. An edit sends only the fields that changed; a
 * blank optional field clears it. A failed save focuses the first invalid field, or the message.
 */
export default function GroupDialog({ group, onClose, onSaved, fallbackFocus }: GroupDialogProps) {
  const [form, setForm] = useState<Form>({
    name: group?.name ?? '',
    type: group?.type ?? 'small_group',
    description: group?.description ?? '',
    meetingDay: group?.meetingDay ?? '',
    meetingTime: group?.meetingTime ?? '',
    location: group?.location ?? '',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [failures, setFailures] = useState(0);
  const createGroup = useCreateGroup();
  const updateGroup = useUpdateGroup();
  const saving = createGroup.isPending || updateGroup.isPending;
  const titleId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const set = (key: keyof Form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

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
    const checked = validateForm(createGroupInput, form);
    if (!checked.ok) {
      fail(checked.errors, checked.errors[FORM_ERROR_KEY] ?? '');
      return;
    }
    const data = checked.data;
    try {
      if (group) {
        const changes = Object.fromEntries(
          FIELDS.filter((key) => (data[key] ?? null) !== group[key]).map((key) => [
            key,
            data[key] ?? null,
          ]),
        );
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        onSaved(await updateGroup.mutateAsync({ id: group.id, input: changes }));
      } else {
        onSaved(await createGroup.mutateAsync(data));
      }
    } catch (err: unknown) {
      const failed = apiErrorsFor(err, FIELDS, 'Failed to save the group');
      fail(failed.fieldErrors, failed.message);
    }
  };

  return (
    <Dialog
      labelledBy={titleId}
      onClose={onClose}
      fallbackFocus={fallbackFocus}
      className="relative mx-auto mt-16 w-full max-w-lg rounded-md border bg-white p-5 shadow-lg"
    >
      <h2 id={titleId} className="text-lg font-medium text-gray-900 mb-4">
        {group ? 'Edit Group' : 'New Group'}
      </h2>
      {error && (
        <div
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-sm"
        >
          {error}
        </div>
      )}
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
        <TextField
          id="group-name"
          label="Name *"
          value={form.name}
          maxLength={MAX_GROUP_NAME}
          onChange={set('name')}
          error={fieldErrors.name}
        />
        <div>
          <label htmlFor="group-type" className={labelClass}>
            Type *
          </label>
          <select
            id="group-type"
            value={form.type}
            onChange={(e) => set('type')(e.target.value as GroupType)}
            className={inputClass}
            {...fieldA11y('group-type', fieldErrors.type)}
          >
            {TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <FieldError fieldId="group-type" message={fieldErrors.type} />
        </div>
        <div>
          <label htmlFor="group-description" className={labelClass}>
            Description
          </label>
          <textarea
            id="group-description"
            value={form.description}
            onChange={(e) => set('description')(e.target.value)}
            rows={3}
            className={inputClass}
            {...fieldA11y('group-description', fieldErrors.description)}
          />
          <FieldError fieldId="group-description" message={fieldErrors.description} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            id="group-meeting-day"
            label="Meeting day"
            value={form.meetingDay}
            maxLength={MAX_MEETING_DAY}
            placeholder="Wednesdays"
            onChange={set('meetingDay')}
            error={fieldErrors.meetingDay}
          />
          <TextField
            id="group-meeting-time"
            label="Meeting time"
            value={form.meetingTime}
            maxLength={MAX_MEETING_TIME}
            placeholder="19:30"
            onChange={set('meetingTime')}
            error={fieldErrors.meetingTime}
          />
        </div>
        <TextField
          id="group-location"
          label="Location"
          value={form.location}
          maxLength={MAX_GROUP_LOCATION}
          onChange={set('location')}
          error={fieldErrors.location}
        />
        <div className="flex justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-hidden focus:ring-2 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            aria-disabled={saving || undefined}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 aria-disabled:opacity-50"
          >
            {saving ? 'Saving...' : group ? 'Save Changes' : 'Create Group'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
