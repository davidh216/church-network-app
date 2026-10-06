'use client';

import { useId, useState, type RefObject } from 'react';
import type { Service } from '@embrace/shared';
import { useServiceAttendance } from '@/lib/queries/services';
import { hasUnsavedMarks, serviceName, type AttendanceDraft } from '@/lib/services/services';
import Dialog from '@/components/ui/Dialog';
import InlineError from '@/components/ui/InlineError';
import Skeleton from '@/components/ui/Skeleton';
import AttendanceChecklist from './AttendanceChecklist';

interface AttendanceSheetProps {
  service: Service;
  onClose: () => void;
  /** Focused on close when the row whose button opened the sheet is gone. */
  fallbackFocus?: RefObject<HTMLElement | null>;
}

const PANEL = 'relative mx-auto mt-8 w-full max-w-lg rounded-md border bg-white p-5 shadow-lg';
const buttonClass =
  'px-4 py-2 text-sm font-medium rounded-md focus:outline-hidden focus:ring-2 disabled:opacity-50';

/**
 * The attendance sheet of one service in a dialog: one checkbox per member, saved in bulk. The
 * user's unsaved marks live here, so closing the sheet (Close, Escape or the backdrop) while any
 * are left asks before discarding them.
 */
export default function AttendanceSheet({ service, onClose, fallbackFocus }: AttendanceSheetProps) {
  const titleId = useId();
  const confirmId = useId();
  const { data, error, refetch } = useServiceAttendance(service.id);
  const [draft, setDraft] = useState<AttendanceDraft>(() => new Map());
  const [confirming, setConfirming] = useState(false);
  const dirty = data ? hasUnsavedMarks(data.members, draft) : false;
  const requestClose = () => (dirty ? setConfirming(true) : onClose());

  return (
    <>
      <Dialog
        labelledBy={titleId}
        onClose={requestClose}
        fallbackFocus={fallbackFocus}
        className={PANEL}
      >
        <h2 id={titleId} className="text-lg font-medium text-gray-900 mb-4">
          Attendance: {serviceName(data?.service ?? service)}
        </h2>
        {data ? (
          <AttendanceChecklist
            serviceId={data.service.id}
            members={data.members}
            draft={draft}
            onDraftChange={setDraft}
            onClose={requestClose}
          />
        ) : error ? (
          <InlineError
            error={error}
            fallback="Failed to load the attendance"
            onRetry={() => void refetch()}
          />
        ) : (
          <Skeleton rows={4} label="Loading attendance" />
        )}
      </Dialog>
      {confirming && (
        <Dialog labelledBy={confirmId} onClose={() => setConfirming(false)}>
          <h2 id={confirmId} className="text-lg font-medium text-gray-900 mb-4">
            Discard unsaved attendance changes?
          </h2>
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={`${buttonClass} text-gray-700 bg-gray-100 hover:bg-gray-200 focus:ring-gray-500`}
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`${buttonClass} text-white bg-red-600 hover:bg-red-700 focus:ring-red-500`}
            >
              Discard
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
