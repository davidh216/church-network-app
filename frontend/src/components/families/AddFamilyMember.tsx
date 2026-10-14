'use client';

import { useState } from 'react';
import { FAMILY_MEMBER_ELSEWHERE } from '@embrace/shared';
import { isApiError } from '@/lib/api/client';
import { getErrorMessage } from '@/lib/errors';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { usePutFamilyMember } from '@/lib/queries/families';
import { useMemberLookup } from '@/lib/queries/users';
import TextField from '@/components/ui/TextField';
import MoveMemberDialog from './MoveMemberDialog';

interface AddFamilyMemberProps {
  familyId: string;
  familyName: string;
  /** Ids already in the family: listed, but not offered again. */
  memberIds: string[];
}

/**
 * Staff: find an active member by name (the member search, debounced) and add them to the
 * family. Someone who belongs to another family is only moved after a confirmation, because the
 * move deletes their relationships there.
 */
export default function AddFamilyMember({ familyId, familyName, memberIds }: AddFamilyMemberProps) {
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [moving, setMoving] = useState<{ id: string; name: string; reason: string } | null>(null);
  const q = useDebouncedValue(query.trim());
  const { data, error, isFetching } = useMemberLookup(q);
  const putMember = usePutFamilyMember();
  const results = q ? (data?.users ?? []) : [];

  const add = async (userId: string, name: string, move = false) => {
    setMessage(null);
    try {
      const { movedFrom } = await putMember.mutateAsync({ familyId, userId, move });
      setMoving(null);
      setMessage({
        error: false,
        text: movedFrom
          ? `${name} moved from the ${movedFrom.familyName} family.`
          : `${name} added to the family.`,
      });
    } catch (err: unknown) {
      if (!move && isApiError(err) && err.status === 409 && err.code === FAMILY_MEMBER_ELSEWHERE) {
        setMoving({ id: userId, name, reason: err.message });
        return;
      }
      setMoving(null);
      setMessage({ error: true, text: getErrorMessage(err, 'Failed to add the member') });
    }
  };

  return (
    <section aria-labelledby="add-family-member" className="mt-6 space-y-3">
      <h3 id="add-family-member" className="text-base font-medium text-gray-900">
        Add a member to the {familyName} family
      </h3>
      <TextField
        id="family-member-search"
        label="Find a member"
        type="search"
        value={query}
        onChange={setQuery}
        placeholder="Type a name"
        autoComplete="off"
      />
      <div aria-live="polite" className="text-sm">
        {message && (
          <p
            role={message.error ? 'alert' : undefined}
            className={message.error ? 'text-red-700' : 'text-green-700'}
          >
            {message.text}
          </p>
        )}
        {error && (
          <p role="alert" className="text-red-700">
            {getErrorMessage(error, 'Failed to search')}
          </p>
        )}
        {q && !isFetching && data && results.length === 0 && (
          <p className="text-gray-600">No active member matches “{q}”.</p>
        )}
      </div>
      {results.length > 0 && (
        <ul
          aria-label="Matching members"
          className="divide-y divide-gray-200 border border-gray-200 rounded-md"
        >
          {results.map((user) => (
            <li key={user.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="font-medium text-gray-900">{user.name}</span>
                {user.email && <span className="ml-2 text-sm text-gray-600">{user.email}</span>}
              </span>
              {memberIds.includes(user.id) ? (
                <span className="text-sm text-gray-600">In the family</span>
              ) : (
                <button
                  type="button"
                  disabled={putMember.isPending}
                  onClick={() => void add(user.id, user.name)}
                  aria-label={`Add ${user.name} to the family`}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  Add
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {moving && (
        <MoveMemberDialog
          name={moving.name}
          reason={moving.reason}
          familyName={familyName}
          pending={putMember.isPending}
          onConfirm={() => void add(moving.id, moving.name, true)}
          onClose={() => setMoving(null)}
        />
      )}
    </section>
  );
}
