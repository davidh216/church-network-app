import type {
  ListMediaParams,
  ListServicesParams,
  ListTimelineParams,
  ListUsersParams,
  MemberAttendanceParams,
  SearchQuery,
} from '@embrace/shared';

/**
 * Query keys. Each list key includes its params, so a new filter or page is a new query
 * and the request for the previous one is superseded. Invalidating a prefix (for example
 * `queryKeys.users.all`) refetches every list, detail and summary under it.
 */
export const queryKeys = {
  users: {
    all: ['users'] as const,
    list: (params: ListUsersParams) => ['users', 'list', params] as const,
    search: (query: SearchQuery) => ['users', 'search', query] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
    summary: () => ['users', 'summary'] as const,
  },
  memberDetails: {
    all: ['member-details'] as const,
    detail: (id: string) => ['member-details', id] as const,
    timeline: (id: string, params: ListTimelineParams) =>
      ['member-details', id, 'timeline', params] as const,
    attendance: (id: string, params: MemberAttendanceParams) =>
      ['member-details', id, 'attendance', params] as const,
    /** The signed-in user's own summary (member ids are cuids, never "me"). */
    ownAttendance: (params: MemberAttendanceParams) =>
      ['member-details', 'me', 'attendance', params] as const,
  },
  services: {
    all: ['services'] as const,
    list: (params: ListServicesParams) => ['services', 'list', params] as const,
  },
  media: {
    all: ['media'] as const,
    list: (params: ListMediaParams) => ['media', 'list', params] as const,
  },
  analytics: { all: ['analytics'] as const },
  /** Outside `analytics` so invalidating the analytics after a job does not refetch the job. */
  engagementJobs: { detail: (id: string) => ['engagement-jobs', id] as const },
  roles: { all: ['roles'] as const },
  savedSearches: { all: ['saved-searches'] as const },
};
