'use client';

import type { UserSummary } from '@/lib/api/users';
import { useUserSummary } from '@/lib/queries/users';
import InlineError from '@/components/ui/InlineError';
import Skeleton from '@/components/ui/Skeleton';

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
  const { data: summary, error, refetch } = useUserSummary();

  if (error) {
    return (
      <InlineError
        error={error}
        fallback="Failed to load member counts"
        onRetry={() => void refetch()}
        className="bg-white shadow-sm rounded-lg"
      />
    );
  }

  if (!summary) {
    return <Skeleton rows={1} label="Loading member counts" />;
  }

  return (
    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {summaryTiles(summary).map((tile) => (
        <div key={tile.label} className="bg-white shadow-sm rounded-lg p-5">
          <dt className="text-sm font-medium text-gray-500">{tile.label}</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">{tile.value}</dd>
        </div>
      ))}
    </dl>
  );
}
