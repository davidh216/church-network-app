'use client';

import MemberAnalyticsDashboard from '@/components/analytics/MemberAnalyticsDashboard';
import RequireStaff from '@/components/auth/RequireStaff';

export default function AnalyticsPage() {
  return (
    <RequireStaff>
      <MemberAnalyticsDashboard />
    </RequireStaff>
  );
}
