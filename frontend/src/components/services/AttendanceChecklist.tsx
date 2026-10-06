'use client';

import {
  useId,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';
import { markAttendanceInput, type ServiceAttendanceMember } from '@embrace/shared';
import { getErrorMessage } from '@/lib/errors';
import { validateForm } from '@/lib/forms/validate';
import { useSaveAttendance } from '@/lib/queries/services';
import {
  attendanceBody,
  hasUnsavedMarks,
  isMarkedPresent,
  markDraft,
  sharedNames,
  withoutSaved,
  type AttendanceDraft,
} from '@/lib/services/services';

interface AttendanceChecklistProps {
  serviceId: string;
  /** The sheet as the server sent it last (refetched after every save). */
  members: ServiceAttendanceMember[];
  /** The user's own unsaved marks, kept by the sheet so closing it can warn about them. */
  draft: AttendanceDraft;
  onDraftChange: Dispatch<SetStateAction<AttendanceDraft>>;
  /** Close asks first when there are unsaved marks. */
  onClose: () => void;
}

const checkboxClass = 'h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded-sm';
const helperClass =
  'px-2 py-1 text-sm font-medium text-blue-700 rounded-md hover:bg-blue-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500';

/**
 * One native checkbox per member (Tab and Space operate it), a name or email filter, helpers that
 * mark the shown members present or not, and Save, which sends only the user's own changes to the
 * bulk endpoint and announces the result in a status message. Every member the user did not touch
 * shows what the server sent last.
 */
export default function AttendanceChecklist({
  serviceId,
  members,
  draft,
  onDraftChange,
  onClose,
}: AttendanceChecklistProps) {
  const [filter, setFilter] = useState('');
  const [saved, setSaved] = useState<{ present: number; absent: number } | null>(null);
  const [error, setError] = useState('');
  const save = useSaveAttendance();
  const idPrefix = useId();

  const shown = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return term
      ? members.filter(
          (m) =>
            m.user.name.toLowerCase().includes(term) || m.user.email.toLowerCase().includes(term),
        )
      : members;
  }, [members, filter]);
  const shared = useMemo(() => sharedNames(members), [members]);
  const presentCount = members.filter((m) => isMarkedPresent(m, draft)).length;

  const change = (ids: string[], value: boolean) => {
    onDraftChange((prev) => markDraft(prev, ids, value));
    setSaved(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaved(null);
    const submitted = draft;
    const checked = validateForm(markAttendanceInput, attendanceBody(members, submitted));
    if (!checked.ok) {
      setError(Object.values(checked.errors)[0] ?? '');
      return;
    }
    try {
      const result = await save.mutateAsync({ id: serviceId, input: checked.data });
      // The sheet is refetched by now; marks made while the save was in flight stay unsaved.
      onDraftChange((current) => withoutSaved(current, submitted));
      setSaved({ present: result.present, absent: result.absent });
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save the attendance'));
    }
  };

  let status = '';
  if (saved) {
    status = `Attendance saved: ${saved.present} present, ${saved.absent} absent.`;
    if (hasUnsavedMarks(members, draft)) status += ' Changes made while saving are not saved yet.';
  }

  const shownIds = shown.map((m) => m.user.id);
  return (
    <form onSubmit={handleSubmit} noValidate>
      <label htmlFor="attendance-filter" className="block text-sm font-medium text-gray-700 mb-1">
        Filter members
      </label>
      <input
        id="attendance-filter"
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => {
          // Enter filters rather than saving; Escape clears the filter instead of closing.
          if (e.key === 'Enter') e.preventDefault();
          else if (e.key === 'Escape' && filter) {
            e.preventDefault();
            e.stopPropagation();
            setFilter('');
          }
        }}
        className="w-full px-3 py-2 mb-3 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
      />
      <fieldset>
        <legend className="text-sm font-medium text-gray-700">
          Present: {presentCount} of {members.length} members
        </legend>
        <div className="flex gap-2 my-2">
          <button type="button" className={helperClass} onClick={() => change(shownIds, true)}>
            {filter.trim() ? 'Mark shown present' : 'Mark all present'}
          </button>
          <button type="button" className={helperClass} onClick={() => change(shownIds, false)}>
            {filter.trim() ? 'Clear shown' : 'Clear all'}
          </button>
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">No members match the filter.</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100 border rounded-md">
            {shown.map((member) => {
              const { user } = member;
              const nameId = `${idPrefix}-${user.id}-name`;
              const emailId = `${idPrefix}-${user.id}-email`;
              const sameName = shared.has(user.name.trim().toLowerCase());
              return (
                <li key={user.id}>
                  <label className="flex flex-wrap items-center gap-x-3 px-3 py-2 text-sm text-gray-800 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-labelledby={nameId}
                      aria-describedby={emailId}
                      checked={isMarkedPresent(member, draft)}
                      onChange={(e) => change([user.id], e.target.checked)}
                    />
                    <span id={nameId}>{sameName ? `${user.name} (${user.email})` : user.name}</span>
                    <span id={emailId} className="text-gray-500 break-all">
                      {user.email}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      {error && (
        <div
          role="alert"
          className="mt-3 p-3 bg-red-100 border border-red-400 text-red-700 rounded-sm"
        >
          {error}
        </div>
      )}
      {/* Always rendered, so screen readers announce the message when it appears. */}
      <p role="status" className="mt-3 text-sm text-green-700 min-h-5">
        {status}
      </p>

      <div className="flex justify-end space-x-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-hidden focus:ring-2 focus:ring-gray-500"
        >
          Close
        </button>
        <button
          type="submit"
          disabled={save.isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {save.isPending ? 'Saving...' : 'Save Attendance'}
        </button>
      </div>
    </form>
  );
}
