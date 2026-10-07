import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EngagementJob } from '@embrace/shared';
import { getAnalytics, getEngagementJob, refreshAllEngagement } from '@/lib/api/analytics';
import { queryKeys } from './keys';

/** Staff only. */
export function useAnalytics() {
  return useQuery({ queryKey: queryKeys.analytics.all, queryFn: getAnalytics });
}

/** How often a running refresh job is polled, and when the page stops waiting for it. */
export const REFRESH_POLL_MS = 1_000;
export const REFRESH_TIMEOUT_MS = 120_000;

export interface EngagementRefresh {
  start: () => void;
  /** From the click until the job completes or fails, the wait times out or polling fails. */
  refreshing: boolean;
  /** The latest known state of the job, once the API has started it. */
  job: EngagementJob | undefined;
  /** Starting the job failed, or its status could not be read (404 after an API restart). */
  error: unknown;
  /** The job was still running after `timeoutMs`; polling stopped. */
  timedOut: boolean;
}

/**
 * Staff only. Starts the refresh-all job (202 { jobId }), polls its status while it runs and,
 * once it has completed or failed, refetches analytics, member lists and profiles (new scores
 * change all three). Nothing is invalidated when the job is only accepted.
 */
export function useRefreshAllEngagement({
  pollMs = REFRESH_POLL_MS,
  timeoutMs = REFRESH_TIMEOUT_MS,
} = {}): EngagementRefresh {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const settledJob = useRef<string | null>(null);

  const startJob = useMutation({
    mutationFn: () => refreshAllEngagement(),
    onSuccess: (job) => {
      queryClient.setQueryData(queryKeys.engagementJobs.detail(job.jobId), job);
      setTimedOut(false);
      setJobId(job.jobId);
    },
  });

  const jobQuery = useQuery({
    queryKey: queryKeys.engagementJobs.detail(jobId ?? ''),
    queryFn: () => getEngagementJob(jobId ?? ''),
    enabled: jobId !== null && !timedOut,
    staleTime: pollMs,
    refetchInterval: (query) =>
      query.state.data?.status === 'running' && !query.state.error ? pollMs : false,
    refetchIntervalInBackground: true,
  });

  const job = jobId === null ? undefined : jobQuery.data;
  const status = job?.status;
  const running = status === 'running';

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [jobId, running, timeoutMs]);

  useEffect(() => {
    if (jobId === null || (status !== 'completed' && status !== 'failed')) return;
    if (settledJob.current === jobId) return;
    settledJob.current = jobId;
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.memberDetails.all }),
    ]);
  }, [jobId, status, queryClient]);

  const pollError = jobId === null ? null : jobQuery.error;
  return {
    start: () => startJob.mutate(),
    refreshing: startJob.isPending || (running && !timedOut && !pollError),
    job,
    error: startJob.error ?? pollError ?? null,
    timedOut,
  };
}
