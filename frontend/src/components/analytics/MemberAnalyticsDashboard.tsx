'use client';

import { useAnalytics, useRefreshAllEngagement } from '@/lib/queries/analytics';
import { riskClass, riskLabel, stageClass, stageLabel } from '@/lib/members/display';
import InlineError from '@/components/ui/InlineError';
import Skeleton from '@/components/ui/Skeleton';
import DistributionList from './DistributionList';
import StatTiles from './StatTiles';
import TopEngagedMembers from './TopEngagedMembers';

/** The `/analytics` route body (staff only; the page wraps it in RequireStaff). */
export default function MemberAnalyticsDashboard() {
  const { data: analytics, isPending, error, refetch } = useAnalytics();
  const refresh = useRefreshAllEngagement();
  const refreshing = refresh.isPending;

  if (isPending) {
    return (
      <div className="p-5 border border-gray-200 shadow-sm rounded-md bg-white">
        <Skeleton rows={6} label="Loading analytics" />
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="p-5 border border-gray-200 shadow-sm rounded-md bg-white">
        <InlineError
          error={error}
          fallback="Analytics not available"
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="p-5 border border-gray-200 shadow-sm rounded-md bg-white">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-gray-200 pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Member Analytics Dashboard</h1>
            <p className="text-gray-600">Comprehensive insights into your church community</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => refresh.mutate()}
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
              <span>{refreshing ? 'Refreshing...' : 'Refresh Scores'}</span>
            </button>
          </div>
        </div>
        {refresh.error && (
          <InlineError
            error={refresh.error}
            fallback="Failed to refresh engagement scores"
            className="mb-6"
          />
        )}

        <StatTiles analytics={analytics} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <TopEngagedMembers members={analytics.topEngagedMembers} />
          </div>
          <div className="space-y-8">
            <DistributionList
              title="Membership Stages"
              counts={analytics.membershipStageDistribution}
              colourFor={stageClass}
              labelFor={stageLabel}
            />
            <DistributionList
              title="Risk Levels"
              counts={analytics.riskLevelDistribution}
              colourFor={riskClass}
              labelFor={riskLabel}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
