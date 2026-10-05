'use client';

import { useId, type RefObject } from 'react';
import type { Service } from '@embrace/shared';
import { useServiceAttendance } from '@/lib/queries/services';
import { serviceName } from '@/lib/services/services';
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

/** The attendance sheet of one service in a dialog: one checkbox per member, saved in bulk. */
export default function AttendanceSheet({ service, onClose, fallbackFocus }: AttendanceSheetProps) {
  const titleId = useId();
  const { data, error, refetch } = useServiceAttendance(service.id);

  return (
    <Dialog labelledBy={titleId} onClose={onClose} fallbackFocus={fallbackFocus} className={PANEL}>
      <h2 id={titleId} className="text-lg font-medium text-gray-900 mb-1">
        Attendance
      </h2>
      <p className="text-sm text-gray-600 mb-4">{serviceName(data?.service ?? service)}</p>
      {data ? (
        // Keyed by service, so another service's sheet starts from its own recorded state.
        <AttendanceChecklist
          key={data.service.id}
          serviceId={data.service.id}
          members={data.members}
          onClose={onClose}
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
  );
}
