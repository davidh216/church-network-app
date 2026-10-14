'use client';

import { useRef, useState } from 'react';
import type { FamilyDetail } from '@embrace/shared';
import { getErrorMessage } from '@/lib/errors';
import { relationSentence } from '@/lib/families/display';
import { useRemoveFamilyRelationship } from '@/lib/queries/families';
import RelationshipDialog from './RelationshipDialog';

const smallButton =
  'px-2.5 py-1 text-sm font-medium rounded-md border focus:outline-hidden focus:ring-2 disabled:opacity-50';

/**
 * Staff: the family's relationships, each pair said from both sides ("Ann is the parent of Ben ·
 * Ben is the child of Ann"), with "Set relationship" (two members needed) and remove.
 */
export default function FamilyRelationships({ family }: { family: FamilyDetail }) {
  const remove = useRemoveFamilyRelationship();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  const removeRelationship = async (relationshipId: string) => {
    setError('');
    try {
      await remove.mutateAsync({ familyId: family.id, relationshipId });
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to remove the relationship'));
    }
  };

  return (
    <section aria-labelledby="family-relationships" className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h2
          id="family-relationships"
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-medium text-gray-900 focus:outline-hidden"
        >
          Relationships
        </h2>
        {family.members.length >= 2 && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            Set relationship
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {family.relationships.length === 0 ? (
        <p className="text-sm text-gray-600">
          {family.members.length >= 2
            ? 'No relationships recorded yet.'
            : 'Add at least two members to record how they are related.'}
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
          {family.relationships.map((r) => {
            const sentence = relationSentence(r.user.name, r.type, r.relatedUser.name);
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
              >
                <span className="text-sm text-gray-900">
                  {sentence}
                  <span className="text-gray-600">
                    {' · '}
                    {relationSentence(r.relatedUser.name, r.inverseType, r.user.name)}
                    {!r.isActive && ' · Inactive'}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => void removeRelationship(r.id)}
                  aria-label={`Remove relationship: ${sentence}`}
                  className={`${smallButton} text-red-700 bg-white border-red-300 hover:bg-red-50 focus:ring-red-500`}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <RelationshipDialog
          family={family}
          onClose={() => setEditing(false)}
          fallbackFocus={headingRef}
        />
      )}
    </section>
  );
}
