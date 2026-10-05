import type { SearchQuery } from '@embrace/shared';

export interface PredefinedSearch {
  name: string;
  description: string;
  query: SearchQuery;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Quick searches for common scenarios, each a valid `searchQuery` (the test parses them with
 * the shared schema). `now` is injectable for tests.
 */
export function predefinedSearches(now: number = Date.now()): PredefinedSearch[] {
  return [
    {
      name: 'High Engagement Members',
      description: 'Engagement score above 80',
      query: {
        conditions: [{ field: 'engagement.engagementScore', operator: 'gt', value: 80 }],
        logic: 'AND',
      },
    },
    {
      name: 'At Risk Members',
      description: 'High or medium risk level',
      query: {
        conditions: [{ field: 'engagement.riskLevel', operator: 'in', value: ['high', 'medium'] }],
        logic: 'AND',
      },
    },
    {
      name: 'New Members (Last 30 Days)',
      description: 'Joined in the last 30 days',
      query: {
        conditions: [{ field: 'createdAt', operator: 'after', value: isoDay(now - 30 * DAY_MS) }],
        logic: 'AND',
      },
    },
    {
      name: 'Leaders and Core Members',
      description: 'Leader or core member stage',
      query: {
        conditions: [
          {
            field: 'engagement.membershipStage',
            operator: 'in',
            value: ['leader', 'core_member'],
          },
        ],
        logic: 'AND',
      },
    },
    {
      name: 'Inactive Members',
      description: 'Inactive stage or high risk',
      query: {
        conditions: [
          { field: 'engagement.membershipStage', operator: 'equals', value: 'inactive' },
          { field: 'engagement.riskLevel', operator: 'equals', value: 'high' },
        ],
        logic: 'OR',
      },
    },
  ];
}
