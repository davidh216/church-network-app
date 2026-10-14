'use client';

import { useId } from 'react';
import Dialog from '@/components/ui/Dialog';

interface MoveMemberDialogProps {
  name: string;
  /** The API's 409 message ("Ann already belongs to the Roe family"). */
  reason: string;
  /** The family they would move to. */
  familyName: string;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Staff confirmation before moving someone out of their current family into this one. */
export default function MoveMemberDialog({
  name,
  reason,
  familyName,
  pending,
  onConfirm,
  onClose,
}: MoveMemberDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <Dialog labelledBy={titleId} describedBy={descriptionId} onClose={onClose}>
      <h2 id={titleId} className="text-lg font-medium text-gray-900 mb-2">
        Move {name}?
      </h2>
      <p id={descriptionId} className="text-sm text-gray-700 mb-4">
        {reason}. Moving them to the {familyName} family removes them from that family and deletes
        their relationships there.
      </p>
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
          onClick={onConfirm}
          disabled={pending}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {pending ? 'Moving...' : 'Move to this family'}
        </button>
      </div>
    </Dialog>
  );
}
