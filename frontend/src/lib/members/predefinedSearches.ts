import type { SearchQuery } from '../../types/domain';

export interface PredefinedSearch {
  name: string;
  description: string;
  query: SearchQuery;
}

/**
 * Quick searches for common scenarios. Hidden behind PREDEFINED_SEARCHES_ENABLED in
 * SavedSearches: these use the old operator names, which the searchQuery schema rejects,
 * and F5 replaces them with valid queries.
 */
export function predefinedSearches(now: number = Date.now()): PredefinedSearch[] {
  return [
    {
      name: 'High Engagement Members',
      description: 'Members with engagement score above 80%',
      query: {
        conditions: [
          {
            field: 'engagement.engagementScore',
            operator: 'greater_than',
            value: '80',
            logic: 'AND',
          },
        ],
        type: 'advanced',
      },
    },
    {
      name: 'At Risk Members',
      description: 'Members with high or medium risk levels',
      query: {
        conditions: [
          { field: 'engagement.riskLevel', operator: 'in', value: 'high,medium', logic: 'AND' },
        ],
        type: 'advanced',
      },
    },
    {
      name: 'New Members (Last 30 Days)',
      description: 'Members who joined in the last 30 days',
      query: {
        conditions: [
          {
            field: 'createdAt',
            operator: 'after',
            value: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            logic: 'AND',
          },
        ],
        type: 'advanced',
      },
    },
    {
      name: 'Leaders and Core Members',
      description: 'Members in leadership or core member stages',
      query: {
        conditions: [
          {
            field: 'engagement.membershipStage',
            operator: 'in',
            value: 'leader,core_member',
            logic: 'AND',
          },
        ],
        type: 'advanced',
      },
    },
    {
      name: 'Inactive Members',
      description: "Members who haven't been active recently",
      query: {
        conditions: [
          {
            field: 'engagement.membershipStage',
            operator: 'equals',
            value: 'inactive',
            logic: 'OR',
          },
          { field: 'engagement.riskLevel', operator: 'equals', value: 'high', logic: 'OR' },
        ],
        type: 'advanced',
      },
    },
  ];
}
