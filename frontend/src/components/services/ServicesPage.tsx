'use client';

import { useMemo, useRef, useState } from 'react';
import { MAX_PAGE_SIZE, type Service } from '@embrace/shared';
import { useHasRole } from '@/lib/auth/AuthProvider';
import { useServices } from '@/lib/queries/services';
import {
  currentMonth,
  defaultServiceDate,
  monthBounds,
  monthTitle,
  shiftMonth,
} from '@/lib/services/services';
import InlineError from '@/components/ui/InlineError';
import Skeleton from '@/components/ui/Skeleton';
import AttendanceSheet from './AttendanceSheet';
import DeleteServiceDialog from './DeleteServiceDialog';
import ServiceDialog from './ServiceDialog';
import ServiceList from './ServiceList';

/** What is open on top of the list: a form, the delete confirmation or an attendance sheet. */
type Open =
  { kind: 'create' } | { kind: 'edit' | 'delete' | 'attendance'; service: Service } | null;

const navButtonClass =
  'px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500';

/** The `/services` route (staff): one month of services, their attendance, create and edit. */
export default function ServicesPage() {
  const [month, setMonth] = useState(() => currentMonth());
  const [open, setOpen] = useState<Open>(null);
  const canDelete = useHasRole('admin');
  // Takes focus when a dialog closes and the control that opened it is gone.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const params = useMemo(() => ({ ...monthBounds(month), pageSize: MAX_PAGE_SIZE }), [month]);
  const { data, error, isPending, isPlaceholderData, refetch } = useServices(params);
  const title = monthTitle(month);
  const close = () => setOpen(null);

  let body;
  if (error && !data) {
    body = (
      <InlineError
        error={error}
        fallback="Failed to load the services"
        onRetry={() => void refetch()}
      />
    );
  } else if (isPending || !data || isPlaceholderData) {
    // While another month loads, its heading is already shown: never the previous month's rows.
    body = <Skeleton rows={3} label="Loading services" />;
  } else if (data.services.length === 0) {
    body = <p className="px-4 py-6 text-sm text-gray-600">No services in {title}.</p>;
  } else {
    body = (
      <>
        <ServiceList
          services={data.services}
          canDelete={canDelete}
          onAttendance={(service) => setOpen({ kind: 'attendance', service })}
          onEdit={(service) => setOpen({ kind: 'edit', service })}
          onDelete={(service) => setOpen({ kind: 'delete', service })}
        />
        {data.total > data.services.length && (
          <p className="px-4 py-3 text-sm text-gray-600">
            Showing the latest {data.services.length} of {data.total} services this month; the
            earliest are not listed.
          </p>
        )}
      </>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-bold text-gray-900 focus:outline-hidden"
        >
          Services
        </h1>
        <button
          type="button"
          onClick={() => setOpen({ kind: 'create' })}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
        >
          New Service
        </button>
      </div>

      <section
        aria-labelledby="services-month"
        aria-busy={isPlaceholderData}
        className="bg-white shadow-sm rounded-lg"
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
          <button
            type="button"
            className={navButtonClass}
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label={`Previous month, ${monthTitle(shiftMonth(month, -1))}`}
          >
            Previous
          </button>
          <h2 id="services-month" className="text-lg font-medium text-gray-900" aria-live="polite">
            {title}
          </h2>
          <button
            type="button"
            className={navButtonClass}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            aria-label={`Next month, ${monthTitle(shiftMonth(month, 1))}`}
          >
            Next
          </button>
        </div>
        {body}
      </section>

      {open?.kind === 'create' && (
        <ServiceDialog
          defaultDate={defaultServiceDate(month)}
          onClose={close}
          onSaved={(service) => {
            setMonth(service.date.slice(0, 7));
            close();
          }}
          fallbackFocus={headingRef}
        />
      )}
      {open?.kind === 'edit' && (
        <ServiceDialog
          service={open.service}
          defaultDate={open.service.date}
          onClose={close}
          onSaved={(service) => {
            setMonth(service.date.slice(0, 7));
            close();
          }}
          fallbackFocus={headingRef}
        />
      )}
      {open?.kind === 'delete' && (
        <DeleteServiceDialog
          service={open.service}
          onClose={close}
          onDeleted={close}
          fallbackFocus={headingRef}
        />
      )}
      {open?.kind === 'attendance' && (
        <AttendanceSheet service={open.service} onClose={close} fallbackFocus={headingRef} />
      )}
    </div>
  );
}
