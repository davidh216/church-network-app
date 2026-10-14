'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { FamilyDetail } from '@embrace/shared';
import { getErrorMessage } from '@/lib/errors';
import { useFocusAfterRemoval } from '@/lib/hooks/useFocusAfterRemoval';
import { useRemoveFamilyMember, useUpdateFamily } from '@/lib/queries/families';

const smallButton =
  'px-2.5 py-1 text-sm font-medium rounded-md border focus:outline-hidden focus:ring-2 aria-disabled:opacity-50';
const selectClass =
  'px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 aria-disabled:opacity-50';

/**
 * Staff: the family's members by name with links to their profiles, the head of family (chosen
 * among the members), and removing a member after a second click to confirm. Removing someone
 * also deletes their relationships in the family, and clears the head when it was them.
 *
 * While a change saves, the other controls do nothing but stay enabled (`aria-disabled`), so the
 * keyboard focus stays put. After a removal, focus moves to the next member's Remove button,
 * else to the heading.
 */
export default function FamilyMembers({ family }: { family: FamilyDetail }) {
  const updateFamily = useUpdateFamily();
  const remove = useRemoveFamilyMember();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Set synchronously, so a second click before the re-render starts nothing.
  const saving = useRef(false);
  const busy = updateFamily.isPending || remove.isPending;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focus = useFocusAfterRemoval(
    family.members.map((m) => m.id),
    headingRef,
  );

  const run = async (change: () => Promise<unknown>, fallback: string) => {
    if (saving.current) return;
    saving.current = true;
    setError('');
    try {
      await change();
    } catch (err: unknown) {
      focus.cancel();
      setError(getErrorMessage(err, fallback));
    } finally {
      saving.current = false;
    }
  };

  const setHead = (headOfFamilyId: string | null) =>
    run(
      () => updateFamily.mutateAsync({ id: family.id, input: { headOfFamilyId } }),
      'Failed to change the head of family',
    );
  const removeMember = (userId: string) =>
    run(async () => {
      focus.expectRemoval(userId);
      await remove.mutateAsync({ familyId: family.id, userId });
      setConfirming(null);
    }, 'Failed to remove the member');

  return (
    <section aria-labelledby="family-members" className="mt-6">
      <h2
        id="family-members"
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-medium text-gray-900 mb-2 focus:outline-hidden"
      >
        Members ({family.members.length})
      </h2>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {family.members.length === 0 ? (
        <p className="text-sm text-gray-600">Nobody is in this family yet.</p>
      ) : (
        <>
          <div className="mb-3">
            <label htmlFor="family-head" className="block text-sm font-medium text-gray-700 mb-1">
              Head of family
            </label>
            <select
              id="family-head"
              value={family.head?.id ?? ''}
              aria-disabled={busy || undefined}
              onChange={(e) => void setHead(e.target.value || null)}
              className={selectClass}
            >
              <option value="">No head</option>
              {family.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
            {family.members.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <Link
                    href={`/members/${encodeURIComponent(m.id)}`}
                    className="font-medium text-blue-700 hover:text-blue-900 hover:underline"
                  >
                    {m.name}
                  </Link>
                  <p className="text-xs text-gray-600">
                    {m.email}
                    {m.isHead && ' · Head of family'}
                    {!m.isActive && ' · Account deactivated'}
                  </p>
                </div>
                {confirming === m.id ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      aria-disabled={busy || undefined}
                      onClick={() => void removeMember(m.id)}
                      className={`${smallButton} text-white bg-red-600 border-red-600 hover:bg-red-700 focus:ring-red-500`}
                    >
                      Confirm remove {m.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className={`${smallButton} text-gray-700 bg-gray-100 border-gray-200 hover:bg-gray-200 focus:ring-gray-500`}
                    >
                      Keep
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    ref={focus.control(m.id)}
                    aria-disabled={busy || undefined}
                    onClick={() => !busy && setConfirming(m.id)}
                    aria-label={`Remove ${m.name} from the family`}
                    className={`${smallButton} text-red-700 bg-white border-red-300 hover:bg-red-50 focus:ring-red-500`}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
