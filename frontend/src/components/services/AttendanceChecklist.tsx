'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { markAttendanceInput, type ServiceAttendanceMember } from '@embrace/shared';
import { getErrorMessage } from '@/lib/errors';
import { validateForm } from '@/lib/forms/validate';
import { useSaveAttendance } from '@/lib/queries/services';
import { attendanceBody, presentIds } from '@/lib/services/services';

interface AttendanceChecklistProps {
  serviceId: string;
  members: ServiceAttendanceMember[];
  onClose: () => void;
}

const checkboxClass = 'h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded-sm';
const helperClass =
  'px-2 py-1 text-sm font-medium text-blue-700 rounded-md hover:bg-blue-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500';

/**
 * One native checkbox per member (Tab and Space operate it), a name filter, helpers that mark the
 * shown members present or not, and Save, which sends the whole sheet to the bulk endpoint and
 * announces the result in a status message.
 */
export default function AttendanceChecklist({
  serviceId,
  members,
  onClose,
}: AttendanceChecklistProps) {
  const [present, setPresent] = useState(() => presentIds(members));
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const save = useSaveAttendance();

  const shown = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return term ? members.filter((m) => m.user.name.toLowerCase().includes(term)) : members;
  }, [members, filter]);

  const change = (ids: string[], value: boolean) => {
    setPresent((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (value) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    setStatus('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setStatus('');
    const checked = validateForm(markAttendanceInput, attendanceBody(members, present));
    if (!checked.ok) {
      setError(Object.values(checked.errors)[0] ?? '');
      return;
    }
    try {
      const saved = await save.mutateAsync({ id: serviceId, input: checked.data });
      setStatus(`Attendance saved: ${saved.present} present, ${saved.absent} absent.`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save the attendance'));
    }
  };

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
        className="w-full px-3 py-2 mb-3 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
      />
      <fieldset>
        <legend className="text-sm font-medium text-gray-700">
          Present: {present.size} of {members.length} members
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
            {shown.map(({ user }) => (
              <li key={user.id}>
                <label className="flex items-center gap-3 px-3 py-2 text-sm text-gray-800 cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    checked={present.has(user.id)}
                    onChange={(e) => change([user.id], e.target.checked)}
                  />
                  {user.name}
                </label>
              </li>
            ))}
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
