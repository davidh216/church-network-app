'use client';

import { useState } from 'react';
import { GROUP_MEMBER_ROLES, type GroupMemberRole } from '@embrace/shared';
import { getErrorMessage } from '@/lib/errors';
import { groupRoleLabel } from '@/lib/groups/display';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useAddGroupMember } from '@/lib/queries/groups';
import { useMemberLookup } from '@/lib/queries/users';
import TextField from '@/components/ui/TextField';

interface AddGroupMemberProps {
  groupId: string;
  groupName: string;
  /** Ids already on the roster: listed, but not offered again. */
  rosterIds: string[];
}

const selectClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500';

/**
 * Staff: find an active member by name (the member search, debounced) and add them to the group
 * with the chosen role. Members already on the roster are shown as such.
 */
export default function AddGroupMember({ groupId, groupName, rosterIds }: AddGroupMemberProps) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<GroupMemberRole>('member');
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const q = useDebouncedValue(query.trim());
  const { data, error, isFetching } = useMemberLookup(q);
  const addMember = useAddGroupMember();
  const results = q ? (data?.users ?? []) : [];

  const add = async (userId: string, name: string) => {
    setMessage(null);
    try {
      await addMember.mutateAsync({ groupId, input: { userId, role } });
      setMessage({ error: false, text: `${name} added as ${groupRoleLabel(role)}.` });
    } catch (err: unknown) {
      setMessage({ error: true, text: getErrorMessage(err, 'Failed to add the member') });
    }
  };

  return (
    <section aria-labelledby="add-group-member" className="mt-6 space-y-3">
      <h3 id="add-group-member" className="text-base font-medium text-gray-900">
        Add a member to {groupName}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <TextField
            id="group-member-search"
            label="Find a member"
            type="search"
            value={query}
            onChange={setQuery}
            placeholder="Type a name"
            autoComplete="off"
          />
        </div>
        <div>
          <label
            htmlFor="group-member-role"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Role
          </label>
          <select
            id="group-member-role"
            value={role}
            onChange={(e) => setRole(e.target.value as GroupMemberRole)}
            className={selectClass}
          >
            {GROUP_MEMBER_ROLES.map((value) => (
              <option key={value} value={value}>
                {groupRoleLabel(value)}
              </option>
            ))}
          </select>
        </div>
      </div>
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
          {results.map((user) => {
            const onRoster = rosterIds.includes(user.id);
            return (
              <li key={user.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium text-gray-900">{user.name}</span>
                  {user.email && <span className="ml-2 text-sm text-gray-600">{user.email}</span>}
                </span>
                {onRoster ? (
                  <span className="text-sm text-gray-600">In the group</span>
                ) : (
                  <button
                    type="button"
                    disabled={addMember.isPending}
                    onClick={() => void add(user.id, user.name)}
                    aria-label={`Add ${user.name} as ${groupRoleLabel(role)}`}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    Add
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
