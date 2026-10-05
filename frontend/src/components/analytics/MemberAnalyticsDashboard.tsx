'use client';

import { useAnalytics } from '@/lib/queries/analytics';
import { riskClass, riskLabel, stageClass, stageLabel } from '@/lib/members/display';
import InlineError from '@/components/ui/InlineError';
import Skeleton from '@/components/ui/Skeleton';
import DistributionList from './DistributionList';
import EngagementComponents from './EngagementComponents';
import RefreshEngagementControl from './RefreshEngagementControl';
import StatTiles from './StatTiles';
import TopEngagedMembers from './TopEngagedMembers';

/** The `/analytics` route body (staff only; the page wraps it in RequireStaff). */
export default function MemberAnalyticsDashboard() {
  const { data: analytics, isPending, error, refetch } = useAnalytics();

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
          <RefreshEngagementControl />
        </div>

        <StatTiles analytics={analytics} />

        {analytics.averageScores && (
          <div className="mb-8">
            <EngagementComponents
              scores={analytics.averageScores}
              title="Average engagement components (active members)"
            />
          </div>
        )}

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
