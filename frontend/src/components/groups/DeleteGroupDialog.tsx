'use client';

import { useId, useState, type RefObject } from 'react';
import type { StaffGroupDetail } from '@embrace/shared';
import { getErrorMessage } from '@/lib/errors';
import { useDeleteGroup } from '@/lib/queries/groups';
import Dialog from '@/components/ui/Dialog';

interface DeleteGroupDialogProps {
  group: StaffGroupDetail;
  onClose: () => void;
  /** Called after the delete (the group queries are already invalidated). */
  onDeleted: () => void;
  fallbackFocus?: RefObject<HTMLElement | null>;
}

/** Admin confirmation before deleting a group and its roster. Archiving keeps both. */
export default function DeleteGroupDialog({
  group,
  onClose,
  onDeleted,
  fallbackFocus,
}: DeleteGroupDialogProps) {
  const deleteGroup = useDeleteGroup();
  const [error, setError] = useState('');
  const titleId = useId();
  const descriptionId = useId();
  const people = group.roster.length;

  const confirm = async () => {
    // The button stays enabled while deleting (disabling it would drop the focus to the page).
    if (deleteGroup.isPending) return;
    setError('');
    try {
      await deleteGroup.mutateAsync(group.id);
      onDeleted();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to delete the group'));
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
        Delete Group?
      </h2>
      <p id={descriptionId} className="text-sm text-gray-700 mb-4">
        {group.name}
        {people > 0 ? ` and its roster (${people} ${people === 1 ? 'person' : 'people'})` : ''} will
        be deleted. This cannot be undone; archive the group instead to keep its history.
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
          aria-disabled={deleteGroup.isPending || undefined}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-red-500 aria-disabled:opacity-50"
        >
          {deleteGroup.isPending ? 'Deleting...' : 'Delete Group'}
        </button>
      </div>
    </Dialog>
  );
}
