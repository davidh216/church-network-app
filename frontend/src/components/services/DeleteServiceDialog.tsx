'use client';

import { useId, useState, type RefObject } from 'react';
import type { Service } from '@embrace/shared';
import { getErrorMessage } from '@/lib/errors';
import { useDeleteService } from '@/lib/queries/services';
import { serviceName } from '@/lib/services/services';
import Dialog from '@/components/ui/Dialog';

interface DeleteServiceDialogProps {
  service: Service;
  onClose: () => void;
  /** Called after the delete (the service queries are already invalidated). */
  onDeleted: () => void;
  /** Focused on close, since the row whose button opened the dialog is gone after a delete. */
  fallbackFocus?: RefObject<HTMLElement | null>;
}

/** Admin confirmation before deleting a service and, with it, its attendance records. */
export default function DeleteServiceDialog({
  service,
  onClose,
  onDeleted,
  fallbackFocus,
}: DeleteServiceDialogProps) {
  const deleteService = useDeleteService();
  const [error, setError] = useState('');
  const titleId = useId();
  const descriptionId = useId();

  const confirm = async () => {
    setError('');
    try {
      await deleteService.mutateAsync(service.id);
      onDeleted();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to delete the service'));
    }
  };

  const recorded = service.presentCount;
  return (
    <Dialog
      labelledBy={titleId}
      describedBy={descriptionId}
      onClose={onClose}
      fallbackFocus={fallbackFocus}
    >
      <h2 id={titleId} className="text-lg font-medium text-gray-900 mb-2">
        Delete Service?
      </h2>
      <p id={descriptionId} className="text-sm text-gray-700 mb-4">
        {serviceName(service)} and its attendance records
        {recorded > 0 ? ` (${recorded} present)` : ''} will be deleted. This cannot be undone.
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
          onClick={confirm}
          disabled={deleteService.isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-red-500 disabled:opacity-50"
        >
          {deleteService.isPending ? 'Deleting...' : 'Delete Service'}
        </button>
      </div>
    </Dialog>
  );
}
