'use client';

import { useMemo } from 'react';
import { monthRange } from '@/lib/format/date';
import { useServices } from '@/lib/queries/services';

/**
 * Staff dashboard tile: how many services are dated in the viewer's current calendar month
 * (GET /api/services with the month's range and pageSize 1, reading `total`).
 */
export default function ServicesThisMonthTile() {
  const range = useMemo(() => monthRange(), []);
  const { data, error, isPending, refetch } = useServices({ ...range, pageSize: 1 });
  let value;
  if (data) {
    value = <span className="text-3xl">{data.total}</span>;
  } else if (error) {
    value = (
      <span className="flex items-center gap-3 text-base">
        Unavailable
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-sm font-medium text-blue-700 underline hover:text-blue-900"
        >
          Retry
        </button>
      </span>
    );
  } else {
    value = <span className="text-base">Loading</span>;
  }
  return (
    <div className="bg-white shadow-sm rounded-lg p-5">
      <dt className="text-sm font-medium text-gray-500">Services this month</dt>
      <dd className="mt-1 font-semibold text-gray-900" aria-busy={isPending && !error}>
        {value}
      </dd>
    </div>
  );
}
