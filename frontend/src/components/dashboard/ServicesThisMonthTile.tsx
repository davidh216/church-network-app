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
  const { data, error, isPending } = useServices({ ...range, pageSize: 1 });
  let value: string | number;
  if (data) value = data.total;
  else if (error) value = 'Unavailable';
  else value = '…';
  return (
    <div className="bg-white shadow-sm rounded-lg p-5">
      <dt className="text-sm font-medium text-gray-500">Services this month</dt>
      <dd
        className={`mt-1 font-semibold text-gray-900 ${typeof value === 'number' ? 'text-3xl' : 'text-base'}`}
        aria-busy={isPending && !error}
      >
        {value}
      </dd>
    </div>
  );
}
