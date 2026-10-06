'use client';

import { useState, type FormEvent } from 'react';
import { updateUserInput } from '@embrace/shared';
import { apiErrorsFor, validateForm, type FieldErrors } from '@/lib/forms/validate';
import { useAuth } from '@/lib/auth/AuthProvider';
import { changedLists, profileLists } from '@/lib/members/memberForm';
import { useUpdateUser } from '@/lib/queries/users';
import type { User } from '@/types/domain';
import ProfileListFields from './ProfileListFields';

const LIST_FIELDS = ['volunteerSkills', 'interests'] as const;

/**
 * A member's own volunteer skills and interests, edited as chips and saved with
 * PUT /api/users/:id (only the lists, and only those that changed). The signed-in user is
 * reloaded afterwards so the rest of the app sees the new lists.
 */
export default function OwnProfileLists({ user }: { user: User }) {
  const [lists, setLists] = useState(() => profileLists(user));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const updateUser = useUpdateUser();
  const { refresh } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (updateUser.isPending) return;
    setStatus('');
    setError('');
    const changed = changedLists(user, lists);
    if (Object.keys(changed).length === 0) {
      setFieldErrors({});
      setStatus('No changes to save.');
      return;
    }
    const checked = validateForm(updateUserInput, changed);
    if (!checked.ok) {
      setFieldErrors(checked.errors);
      return;
    }
    setFieldErrors({});
    try {
      await updateUser.mutateAsync({ id: user.id, input: checked.data });
      // The stored form (trimmed, duplicates dropped), so the form shows no pending change.
      setLists((prev) => ({ ...prev, ...checked.data }));
      setStatus('Your skills and interests were saved.');
      await refresh();
    } catch (err: unknown) {
      const failed = apiErrorsFor(err, LIST_FIELDS, 'Could not save your skills and interests');
      setFieldErrors(failed.fieldErrors);
      setError(failed.message);
    }
  };

  return (
    <section aria-labelledby="own-lists-heading" className="mt-6 space-y-4">
      <h2 id="own-lists-heading" className="text-lg font-medium text-gray-900">
        Skills and Interests
      </h2>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <ProfileListFields
          idPrefix="own"
          lists={lists}
          onChange={(next) => {
            setLists(next);
            setStatus('');
          }}
          errors={fieldErrors}
        />
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            aria-disabled={updateUser.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 aria-disabled:opacity-50"
          >
            {updateUser.isPending ? 'Saving...' : 'Save skills and interests'}
          </button>
          <p role="status" className="text-sm text-gray-700">
            {status}
          </p>
        </div>
      </form>
    </section>
  );
}
