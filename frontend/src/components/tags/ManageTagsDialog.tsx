'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { enumLabel, type Tag } from '@embrace/shared';
import { focusableWithin } from '@/lib/a11y/focus';
import { useHasRole } from '@/lib/auth/AuthProvider';
import { getErrorMessage } from '@/lib/errors';
import { useTags, useUpdateTag } from '@/lib/queries/tags';
import Dialog from '@/components/ui/Dialog';
import InlineError from '@/components/ui/InlineError';
import Skeleton from '@/components/ui/Skeleton';
import DeleteTagConfirm from './DeleteTagConfirm';
import TagForm from './TagForm';
import { TagChip } from './TagChips';

interface ManageTagsDialogProps {
  onClose: () => void;
  fallbackFocus?: RefObject<HTMLElement | null>;
}

/** What the dialog shows: the list, the form (new or editing a tag) or a delete confirmation. */
type View = { kind: 'list' } | { kind: 'form'; tag?: Tag } | { kind: 'delete'; tag: Tag };

const smallButton =
  'px-2 py-1 text-xs font-medium rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500';

/**
 * Staff manage the tag list: create, edit, archive and restore; admins also delete (the
 * confirmation names how many members lose the tag). Archived tags stay on the members who
 * have them but cannot be assigned again.
 */
export default function ManageTagsDialog({ onClose, fallbackFocus }: ManageTagsDialogProps) {
  const titleId = useId();
  const canDelete = useHasRole('admin');
  const [view, setView] = useState<View>({ kind: 'list' });
  const [error, setError] = useState('');
  const { data: tags, error: loadError, isPending, refetch } = useTags(true);
  const updateTag = useUpdateTag();
  // Moving between the list, the form and the confirmation removes the control that had focus,
  // so focus moves to the first control of the new view (not on the first render: the dialog
  // places it then).
  const bodyRef = useRef<HTMLDivElement>(null);
  const shownView = useRef(view);
  useEffect(() => {
    if (shownView.current === view) return;
    shownView.current = view;
    if (bodyRef.current) focusableWithin(bodyRef.current)[0]?.focus();
  }, [view]);

  const setArchived = async (tag: Tag, archived: boolean) => {
    setError('');
    try {
      await updateTag.mutateAsync({ id: tag.id, input: { isActive: !archived } });
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to update the tag'));
    }
  };

  const toList = () => setView({ kind: 'list' });

  let body;
  if (view.kind === 'form') {
    body = <TagForm tag={view.tag} onDone={toList} onCancel={toList} />;
  } else if (view.kind === 'delete') {
    body = <DeleteTagConfirm tag={view.tag} onDone={toList} onCancel={toList} />;
  } else if (loadError && !tags) {
    body = (
      <InlineError
        error={loadError}
        fallback="Failed to load tags"
        onRetry={() => void refetch()}
      />
    );
  } else if (isPending || !tags) {
    body = <Skeleton rows={3} label="Loading tags" />;
  } else {
    body = (
      <>
        <button
          type="button"
          onClick={() => setView({ kind: 'form' })}
          className="mb-3 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
        >
          New Tag
        </button>
        {error && (
          <div
            role="alert"
            className="mb-3 p-2 bg-red-100 border border-red-400 text-red-700 text-sm"
          >
            {error}
          </div>
        )}
        {tags.length === 0 ? (
          <p className="text-sm text-gray-600">No tags yet.</p>
        ) : (
          <ul aria-label="Tags" className="divide-y divide-gray-200">
            {tags.map((tag) => (
              <li key={tag.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <TagChip tag={tag} />
                  <p className="text-xs text-gray-600 mt-0.5">
                    {enumLabel(tag.category)} · {tag.usageCount}{' '}
                    {tag.usageCount === 1 ? 'member' : 'members'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setView({ kind: 'form', tag })}
                    aria-label={`Edit ${tag.name}`}
                    className={`${smallButton} bg-gray-100 text-gray-700 hover:bg-gray-200`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={updateTag.isPending}
                    onClick={() => void setArchived(tag, tag.isActive)}
                    aria-label={`${tag.isActive ? 'Archive' : 'Restore'} ${tag.name}`}
                    className={`${smallButton} bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50`}
                  >
                    {tag.isActive ? 'Archive' : 'Restore'}
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => setView({ kind: 'delete', tag })}
                      aria-label={`Delete ${tag.name}`}
                      className={`${smallButton} bg-red-50 text-red-700 hover:bg-red-100`}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <Dialog
      labelledBy={titleId}
      onClose={onClose}
      fallbackFocus={fallbackFocus}
      className="relative mx-auto mt-16 w-full max-w-lg rounded-md border bg-white p-5 shadow-lg"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 id={titleId} className="text-lg font-medium text-gray-900">
          Manage Tags
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-hidden focus:ring-2 focus:ring-gray-500"
        >
          Close
        </button>
      </div>
      <p className="text-sm text-gray-600 mb-3">
        Tags are visible to staff only. Archived tags stay on members but cannot be assigned.
      </p>
      <div ref={bodyRef}>{body}</div>
    </Dialog>
  );
}
