'use client';

import { useId, useState, type FormEvent, type RefObject } from 'react';
import {
  RELATIONSHIP_TYPES,
  setFamilyRelationshipInput,
  type FamilyDetail,
  type RelationshipType,
} from '@embrace/shared';
import { apiErrorsFor, fieldA11y, validateForm, type FieldErrors } from '@/lib/forms/validate';
import { relationshipLabel, relationSentence } from '@/lib/families/display';
import { useSetFamilyRelationship } from '@/lib/queries/families';
import Dialog from '@/components/ui/Dialog';
import FieldError from '@/components/ui/FieldError';

interface RelationshipDialogProps {
  family: FamilyDetail;
  onClose: () => void;
  fallbackFocus?: RefObject<HTMLElement | null>;
}

const selectClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const FIELDS = ['userId', 'type', 'relatedUserId'] as const;

/**
 * Staff: "Set relationship" between two members of the family, read as a sentence ("Ann is the
 * parent of Ben"). A pair that already has a relationship is updated: each pair is stored once.
 */
export default function RelationshipDialog({
  family,
  onClose,
  fallbackFocus,
}: RelationshipDialogProps) {
  const members = family.members;
  const [userId, setUserId] = useState(members[0]?.id ?? '');
  const [type, setType] = useState<RelationshipType>('spouse');
  const [relatedUserId, setRelatedUserId] = useState(members[1]?.id ?? '');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const setRelationship = useSetFamilyRelationship();
  const titleId = useId();
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? '…';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // The button stays enabled while saving (disabling it would drop the focus to the page).
    if (setRelationship.isPending) return;
    const checked = validateForm(setFamilyRelationshipInput, { userId, type, relatedUserId });
    if (!checked.ok) {
      setFieldErrors(checked.errors);
      return;
    }
    setFieldErrors({});
    setError('');
    try {
      await setRelationship.mutateAsync({ familyId: family.id, input: checked.data });
      onClose();
    } catch (err: unknown) {
      const failed = apiErrorsFor(err, FIELDS, 'Failed to save the relationship');
      setFieldErrors(failed.fieldErrors);
      setError(failed.message);
    }
  };

  const personSelect = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    key: 'userId' | 'relatedUserId',
  ) => (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectClass}
        {...fieldA11y(id, fieldErrors[key])}
      >
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <FieldError fieldId={id} message={fieldErrors[key]} />
    </div>
  );

  return (
    <Dialog labelledBy={titleId} onClose={onClose} fallbackFocus={fallbackFocus}>
      <h2 id={titleId} className="text-lg font-medium text-gray-900 mb-4">
        Set Relationship
      </h2>
      {error && (
        <div
          role="alert"
          className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-sm"
        >
          {error}
        </div>
      )}
      <form onSubmit={submit} noValidate className="space-y-4">
        {personSelect('relationship-user', 'Person', userId, setUserId, 'userId')}
        <div>
          <label htmlFor="relationship-type" className={labelClass}>
            is the
          </label>
          <select
            id="relationship-type"
            value={type}
            onChange={(e) => setType(e.target.value as RelationshipType)}
            className={selectClass}
          >
            {RELATIONSHIP_TYPES.map((value) => (
              <option key={value} value={value}>
                {relationshipLabel(value)}
              </option>
            ))}
          </select>
        </div>
        {personSelect(
          'relationship-related',
          'of',
          relatedUserId,
          setRelatedUserId,
          'relatedUserId',
        )}
        <p className="text-sm text-gray-700" aria-live="polite">
          {userId && relatedUserId && userId !== relatedUserId
            ? `${relationSentence(nameOf(userId), type, nameOf(relatedUserId))}.`
            : 'Choose two different people.'}
        </p>
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
            aria-disabled={setRelationship.isPending || undefined}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 aria-disabled:opacity-50"
          >
            {setRelationship.isPending ? 'Saving...' : 'Save Relationship'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
