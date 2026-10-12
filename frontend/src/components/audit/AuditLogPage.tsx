'use client';

import { useMemo, useState } from 'react';
import type { AuditAction, AuditTargetType, ListAuditParams } from '@embrace/shared';
import { useClampedPage } from '@/lib/hooks/useClampedPage';
import { useResettingPage } from '@/lib/hooks/useResettingPage';
import { useAuditLog } from '@/lib/queries/audit';
import InlineError from '@/components/ui/InlineError';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import { targetText } from '@/lib/audit/display';
import AuditFilters, { EMPTY_AUDIT_FILTERS, type AuditFilterValues } from './AuditFilters';
import AuditTable from './AuditTable';

const PAGE_SIZE = 50;
const DATE_RANGE_ERROR = 'The end date must not be before the start date';

/** The audit log's API parameters for the current filters (a chip's target wins over the type). */
export function auditParams(filters: AuditFilterValues): ListAuditParams {
  return {
    actorId: filters.actor?.id,
    action: (filters.action || undefined) as AuditAction | undefined,
    targetType: (filters.target?.type ?? (filters.targetType || undefined)) as
      AuditTargetType | undefined,
    targetId: filters.target?.id,
    from: filters.from || undefined,
    to: filters.to || undefined,
  };
}

/** The `/admin/audit` route (admin): who changed what, newest first, with filters. */
export default function AuditLogPage() {
  const [filters, setFilters] = useState<AuditFilterValues>(EMPTY_AUDIT_FILTERS);
  const base = useMemo(() => auditParams(filters), [filters]);
  const [page, setPage] = useResettingPage(JSON.stringify(base));
  const dateError = base.from && base.to && base.from > base.to ? DATE_RANGE_ERROR : null;
  const params = useMemo(() => ({ ...base, page, pageSize: PAGE_SIZE }), [base, page]);
  const { data, error, isPending, isPlaceholderData, refetch } = useAuditLog(params, {
    enabled: !dateError,
  });
  useClampedPage(page, setPage, isPlaceholderData ? undefined : data?.total, PAGE_SIZE);

  let body;
  if (dateError) {
    body = null;
  } else if (error && !data) {
    body = (
      <InlineError
        error={error}
        fallback="Failed to load the audit log"
        onRetry={() => void refetch()}
      />
    );
  } else if (isPending || !data) {
    body = <Skeleton rows={5} label="Loading the audit log" />;
  } else if (data.events.length === 0) {
    body = <p className="px-4 py-6 text-sm text-gray-600">No audit events match these filters.</p>;
  } else {
    body = (
      <>
        <AuditTable
          events={data.events}
          onActor={(actor) => setFilters((prev) => ({ ...prev, actor }))}
          onTarget={(event) =>
            setFilters((prev) => ({
              ...prev,
              target: { type: event.targetType, id: event.targetId!, name: targetText(event) },
            }))
          }
        />
        <Pagination
          total={data.total}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          itemLabel="events"
        />
      </>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Audit Log</h1>
      <p className="text-sm text-gray-600 mb-4">
        Role and status changes, password resets, tags, groups and families: who changed what, and
        when. Events are kept indefinitely.
      </p>
      <section
        aria-label="Audit events"
        aria-busy={isPlaceholderData}
        className="bg-white shadow-sm rounded-lg"
      >
        <AuditFilters filters={filters} onChange={setFilters} dateError={dateError} />
        {body}
      </section>
    </div>
  );
}
