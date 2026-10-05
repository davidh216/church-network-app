'use client';

import { useState } from 'react';
import { DEFAULT_TIMELINE_PAGE_SIZE, type TimelineKind } from '@embrace/shared';
import type { MemberDetails } from '@/types/domain';
import { formatDate, formatDay } from '@/lib/members/profile';
import { useMemberTimeline } from '@/lib/queries/memberDetails';
import InlineError from '@/components/ui/InlineError';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import { EmptyTab, SectionHeader, pillClass } from './Field';

const KIND_LABELS: Record<TimelineKind, string> = {
  interaction: 'Interaction',
  milestone: 'Milestone',
  note: 'Note',
  attendance: 'Attendance',
};

const KIND_CLASSES: Record<TimelineKind, string> = {
  interaction: 'bg-blue-100 text-blue-800',
  milestone: 'bg-purple-100 text-purple-800',
  note: 'bg-yellow-100 text-yellow-800',
  attendance: 'bg-green-100 text-green-800',
};

/**
 * The "Timeline" tab: the member's computed timeline (interactions, milestones, notes the viewer
 * may see and attended services), newest first, one page at a time.
 */
export default function Timeline({ member }: { member: MemberDetails }) {
  const [page, setPage] = useState(1);
  const pageSize = DEFAULT_TIMELINE_PAGE_SIZE;
  const { data, isPending, error, refetch } = useMemberTimeline(member.id, { page, pageSize });

  if (isPending) return <Skeleton rows={4} label="Loading timeline" />;
  if (error || !data) {
    return (
      <InlineError
        error={error}
        fallback="Could not load the timeline"
        onRetry={() => void refetch()}
      />
    );
  }

  const { items, total } = data;
  return (
    <div className="space-y-6">
      <SectionHeader title="Member Timeline" count={`${total} activities`} />
      {items.length > 0 ? (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={`${item.kind}-${item.id}`}
              className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg"
            >
              <div className="shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span aria-hidden="true" className="text-sm font-medium text-blue-600">
                    {KIND_LABELS[item.kind].charAt(0)}
                  </span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-900">{item.title}</h3>
                  <span className="text-xs text-gray-500">
                    {item.dateOnly ? formatDay(item.date) : formatDate(item.date)}
                  </span>
                </div>
                {item.summary && <p className="text-sm text-gray-600 mt-1">{item.summary}</p>}
                <div className="flex items-center space-x-2 mt-2">
                  <span className={`${pillClass} ${KIND_CLASSES[item.kind]}`}>
                    {KIND_LABELS[item.kind]}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyTab>No timeline activities found</EmptyTab>
      )}
      {total > pageSize && (
        <Pagination
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          itemLabel="activities"
        />
      )}
    </div>
  );
}
