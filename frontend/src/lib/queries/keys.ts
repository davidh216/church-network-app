import type { ListMediaParams, ListUsersParams } from '@embrace/shared';

/**
 * Query keys. Each list key includes its params, so a new filter or page is a new query
 * and the request for the previous one is superseded. Invalidating a prefix (for example
 * `queryKeys.users.all`) refetches every list, detail and summary under it.
 */
export const queryKeys = {
  users: {
    all: ['users'] as const,
    list: (params: ListUsersParams) => ['users', 'list', params] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
    summary: () => ['users', 'summary'] as const,
  },
  memberDetails: {
    all: ['member-details'] as const,
    detail: (id: string) => ['member-details', id] as const,
  },
  media: {
    all: ['media'] as const,
    list: (params: ListMediaParams) => ['media', 'list', params] as const,
  },
  analytics: { all: ['analytics'] as const },
  roles: { all: ['roles'] as const },
  savedSearches: { all: ['saved-searches'] as const },
};
