'use client';

import { useCallback, useEffect, useState } from 'react';
import { getUserSummary, type UserSummary } from '@/lib/api/users';
import { getErrorMessage } from '@/lib/errors';

interface Tile {
  label: string;
  value: number;
}

/** Staff see every count; a member's summary has only `total`, shown as a single Members tile. */
export function summaryTiles(summary: UserSummary): Tile[] {
  const { total, active, pendingApproval, newThisMonth } = summary;
  if (active === undefined || pendingApproval === undefined || newThisMonth === undefined) {
    return [{ label: 'Members', value: total }];
  }
  return [
    { label: 'Total members', value: total },
    { label: 'Active', value: active },
    { label: 'Pending approval', value: pendingApproval },
    { label: 'New this month', value: newThisMonth },
  ];
}

export default function SummaryTiles() {
  const [summary, setSummary] = useState<UserSummary | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setSummary(await getUserSummary());
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load member counts'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div role="alert" className="bg-white shadow rounded-lg p-5 text-sm text-red-700">
        {error}{' '}
        <button type="button" onClick={() => void load()} className="ml-2 font-medium underline">
          Retry
        </button>
      </div>
    );
  }

  if (!summary) {
    return (
      <p role="status" className="text-sm text-gray-500">
        Loading member counts...
      </p>
    );
  }

  return (
    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {summaryTiles(summary).map((tile) => (
        <div key={tile.label} className="bg-white shadow rounded-lg p-5">
          <dt className="text-sm font-medium text-gray-500">{tile.label}</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">{tile.value}</dd>
        </div>
      ))}
    </dl>
  );
}
