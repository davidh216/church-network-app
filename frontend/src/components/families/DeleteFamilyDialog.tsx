'use client';

import { useId, useState, type RefObject } from 'react';
import type { FamilyDetail } from '@embrace/shared';
import { getErrorMessage } from '@/lib/errors';
import { useDeleteFamily } from '@/lib/queries/families';
import Dialog from '@/components/ui/Dialog';

interface DeleteFamilyDialogProps {
  family: FamilyDetail;
  onClose: () => void;
  /** Called after the delete (the family queries are already invalidated). */
  onDeleted: () => void;
  fallbackFocus?: RefObject<HTMLElement | null>;
}

/** Admin confirmation before deleting a family: members are unlinked, relationships deleted. */
export default function DeleteFamilyDialog({
  family,
  onClose,
  onDeleted,
  fallbackFocus,
}: DeleteFamilyDialogProps) {
  const deleteFamily = useDeleteFamily();
  const [error, setError] = useState('');
  const titleId = useId();
  const descriptionId = useId();
  const people = family.members.length;
  const relationships = family.relationships.length;

  const confirm = async () => {
    setError('');
    try {
      await deleteFamily.mutateAsync(family.id);
      onDeleted();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to delete the family'));
    }
  };

  return (
    <Dialog
      labelledBy={titleId}
      describedBy={descriptionId}
      onClose={onClose}
      fallbackFocus={fallbackFocus}
    >
      <h2 id={titleId} className="text-lg font-medium text-gray-900 mb-2">
        Delete Family?
      </h2>
      <p id={descriptionId} className="text-sm text-gray-700 mb-4">
        The {family.familyName} family will be deleted.
        {people > 0 &&
          ` Its ${people} ${people === 1 ? 'member stays' : 'members stay'} in the directory without a family.`}
        {relationships > 0 &&
          ` ${relationships} ${relationships === 1 ? 'relationship' : 'relationships'} will be deleted.`}{' '}
        This cannot be undone.
      </p>
      {error && (
        <div
          role="alert"
          className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-sm"
        >
          {error}
        </div>
      )}
      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-hidden focus:ring-2 focus:ring-gray-500"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={deleteFamily.isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-red-500 disabled:opacity-50"
        >
          {deleteFamily.isPending ? 'Deleting...' : 'Delete Family'}
        </button>
      </div>
    </Dialog>
  );
}
