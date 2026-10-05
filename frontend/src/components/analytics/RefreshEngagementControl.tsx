'use client';

import type { EngagementJob } from '@embrace/shared';
import { isApiError } from '@/lib/api/client';
import { REFRESH_TIMEOUT_MS, useRefreshAllEngagement } from '@/lib/queries/analytics';
import InlineError from '@/components/ui/InlineError';

const refreshed = (job: EngagementJob) => job.processed - job.failed - job.skipped;

/** The progress line read out by screen readers (role="status"); empty when idle. */
function statusText(job: EngagementJob | undefined, starting: boolean, timedOut: boolean): string {
  if (starting) return 'Starting the engagement refresh…';
  if (!job) return '';
  if (job.status === 'running') {
    if (timedOut) return '';
    return `Refreshing engagement scores: ${job.processed} of ${job.total} members done.`;
  }
  if (job.status === 'completed') {
    return `Engagement scores refreshed for ${refreshed(job)} of ${job.total} members.`;
  }
  return '';
}

/** What went wrong, if anything: a failed start, a lost or failed job, failures, a timeout. */
function problem(job: EngagementJob | undefined, error: unknown, timedOut: boolean) {
  if (isApiError(error) && error.status === 404 && job) {
    return 'The refresh status is no longer available (the server may have restarted). Reload the page to see the latest scores.';
  }
  if (error) return error;
  if (timedOut) {
    return `The refresh is still running after ${REFRESH_TIMEOUT_MS / 60_000} minutes. Reload the page later to see the new scores.`;
  }
  if (job?.status === 'failed') {
    return 'The engagement refresh failed. Some scores may not have been updated.';
  }
  if (job?.status === 'completed' && job.failed > 0) {
    return `${job.failed} of ${job.total} members could not be refreshed.`;
  }
  return null;
}

/** The analytics header's "Refresh Scores" button, its live progress and any failure. */
export default function RefreshEngagementControl(props: { pollMs?: number; timeoutMs?: number }) {
  const { start, refreshing, job, error, timedOut } = useRefreshAllEngagement(props);
  const running = refreshing && job?.status === 'running';
  const issue = refreshing ? null : problem(job, error, timedOut);

  return (
    <div className="flex flex-col items-end space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={refreshing}
        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-50 flex items-center space-x-2"
      >
        <svg
          aria-hidden="true"
          className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        <span>
          {running
            ? `Refreshing ${job.processed}/${job.total}`
            : refreshing
              ? 'Refreshing...'
              : 'Refresh Scores'}
        </span>
      </button>
      <p role="status" className="text-sm text-gray-600">
        {statusText(job, refreshing && job?.status !== 'running', timedOut)}
      </p>
      {issue !== null && (
        <InlineError error={issue} fallback="Failed to refresh engagement scores" />
      )}
    </div>
  );
}
