'use client';

import { useState } from 'react';
import type { Tag } from '@embrace/shared';
import { getErrorMessage } from '@/lib/errors';
import { useDeleteTag } from '@/lib/queries/tags';

interface DeleteTagConfirmProps {
  tag: Tag;
  onDone: () => void;
  onCancel: () => void;
}

/** The admin's confirmation before a tag is deleted, naming how many members lose it. */
export default function DeleteTagConfirm({ tag, onDone, onCancel }: DeleteTagConfirmProps) {
  const deleteTag = useDeleteTag();
  const [error, setError] = useState('');
  const members = `${tag.usageCount} ${tag.usageCount === 1 ? 'member' : 'members'}`;

  const confirm = async () => {
    setError('');
    try {
      await deleteTag.mutateAsync(tag.id);
      onDone();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to delete the tag'));
    }
  };

  return (
    <section aria-labelledby="delete-tag-heading" className="space-y-3">
      <h3 id="delete-tag-heading" className="text-base font-medium text-gray-900">
        Delete the tag {tag.name}?
      </h3>
      <p className="text-sm text-gray-700">
        It will be removed from {members}. This cannot be undone; archive the tag instead to keep it
        on the members who have it.
      </p>
      {error && (
        <div role="alert" className="p-2 bg-red-100 border border-red-400 text-red-700 text-sm">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-hidden focus:ring-2 focus:ring-gray-500"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={deleteTag.isPending}
          className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-red-500 disabled:opacity-50"
        >
          {deleteTag.isPending ? 'Deleting...' : `Delete from ${members}`}
        </button>
      </div>
    </section>
  );
}
