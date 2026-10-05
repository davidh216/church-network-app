import { renderHook, waitFor } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ApiError } from '@/lib/api/client';
import { makeTestQueryClient, queryWrapper } from '@/test/render';
import { useAnalytics, useRefreshAllEngagement } from './analytics';
import { queryKeys } from './keys';
import { useCreateMedia, useMedia } from './media';
import { useMemberDetails } from './memberDetails';
import { useRoles } from './roles';
import {
  useCreateSavedSearch,
  useDeleteSavedSearch,
  useRecordSavedSearchUse,
  useSavedSearches,
} from './savedSearches';
import {
  useCreateUser,
  useMemberSearch,
  useUpdateUser,
  useUser,
  useUserSummary,
  useUsers,
} from './users';

const usersApi = vi.hoisted(() => ({
  listUsers: vi.fn(),
  searchUsers: vi.fn(),
  getUser: vi.fn(),
  getUserSummary: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('@/lib/api/users', () => usersApi);
const mediaApi = vi.hoisted(() => ({ listMedia: vi.fn(), createMedia: vi.fn() }));
vi.mock('@/lib/api/media', () => mediaApi);
const analyticsApi = vi.hoisted(() => ({ getAnalytics: vi.fn(), refreshAllEngagement: vi.fn() }));
vi.mock('@/lib/api/analytics', () => analyticsApi);
const rolesApi = vi.hoisted(() => ({ listRoles: vi.fn() }));
vi.mock('@/lib/api/roles', () => rolesApi);
const detailsApi = vi.hoisted(() => ({ getMemberDetails: vi.fn() }));
vi.mock('@/lib/api/memberDetails', () => detailsApi);
const savedApi = vi.hoisted(() => ({
  listSavedSearches: vi.fn(),
  createSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
  useSavedSearch: vi.fn(),
}));
vi.mock('@/lib/api/savedSearches', () => savedApi);

const failure = new ApiError(500, 'Server exploded');
const stageQuery = {
  conditions: [
    {
      field: 'engagement.membershipStage' as const,
      operator: 'equals' as const,
      value: 'new_member' as const,
    },
  ],
  logic: 'AND' as const,
  page: 1,
  pageSize: 25,
};

interface QueryCase {
  name: string;
  api: Mock;
  useHook: () => UseQueryResult<unknown>;
  args: unknown[];
}

interface MutationCase {
  name: string;
  api: Mock;
  // Variables differ per hook; the components check each hook's own types.
  useHook: () => { mutateAsync: (variables: never) => Promise<unknown>; error: Error | null };
  variables: unknown;
  args: unknown[];
  invalidates: (readonly unknown[])[];
}

beforeEach(() => vi.resetAllMocks());

/** Each query hook: its API function, the hook call, and the expected arguments. */
const queryCases: QueryCase[] = [
  {
    name: 'useUsers',
    api: usersApi.listUsers,
    useHook: () => useUsers({ q: 'ann', page: 2, pageSize: 25 }),
    args: [{ q: 'ann', page: 2, pageSize: 25 }],
  },
  {
    name: 'useMemberSearch',
    api: usersApi.searchUsers,
    useHook: () => useMemberSearch(stageQuery),
    args: [stageQuery],
  },
  { name: 'useUser', api: usersApi.getUser, useHook: () => useUser('u1'), args: ['u1'] },
  { name: 'useUserSummary', api: usersApi.getUserSummary, useHook: useUserSummary, args: [] },
  {
    name: 'useMemberDetails',
    api: detailsApi.getMemberDetails,
    useHook: () => useMemberDetails('u1'),
    args: ['u1'],
  },
  {
    name: 'useMedia',
    api: mediaApi.listMedia,
    useHook: () => useMedia({ search: 'grace', page: 1, pageSize: 24 }),
    args: [{ search: 'grace', page: 1, pageSize: 24 }],
  },
  { name: 'useAnalytics', api: analyticsApi.getAnalytics, useHook: useAnalytics, args: [] },
  { name: 'useRoles', api: rolesApi.listRoles, useHook: () => useRoles(), args: [] },
  {
    name: 'useSavedSearches',
    api: savedApi.listSavedSearches,
    useHook: useSavedSearches,
    args: [],
  },
];

describe.each(queryCases)('$name', ({ api, useHook, args }) => {
  it('returns the API data', async () => {
    api.mockResolvedValue({ ok: true });
    const { result } = renderHook(useHook, { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ ok: true });
    expect(api).toHaveBeenCalledTimes(1);
    if (args.length) expect(api).toHaveBeenCalledWith(...args);
  });

  it('exposes the API error', async () => {
    api.mockRejectedValue(failure);
    const { result } = renderHook(useHook, { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(failure);
  });
});

describe('useMemberSearch', () => {
  it('stays idle without a query', () => {
    const { result } = renderHook(() => useMemberSearch(null), {
      wrapper: queryWrapper(makeTestQueryClient()),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(usersApi.searchUsers).not.toHaveBeenCalled();
  });

  it('caches under the users prefix, so member invalidations refetch the search', async () => {
    usersApi.searchUsers.mockResolvedValue({ users: [], total: 0, page: 1, pageSize: 25 });
    const client = makeTestQueryClient();
    const { result } = renderHook(() => useMemberSearch(stageQuery), {
      wrapper: queryWrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(queryKeys.users.search(stageQuery))).toBeDefined();
    await client.invalidateQueries({ queryKey: queryKeys.users.all });
    await waitFor(() => expect(usersApi.searchUsers).toHaveBeenCalledTimes(2));
  });
});

describe('list hooks keep the previous page while the next loads', () => {
  it('useUsers shows the old page as placeholder data under the new key', async () => {
    usersApi.listUsers.mockResolvedValueOnce({ users: ['first'], total: 30 });
    let resolveNext: (value: unknown) => void = () => undefined;
    usersApi.listUsers.mockReturnValueOnce(new Promise((resolve) => (resolveNext = resolve)));
    const { result, rerender } = renderHook(({ page }) => useUsers({ page, pageSize: 25 }), {
      wrapper: queryWrapper(),
      initialProps: { page: 1 },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ page: 2 });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data).toEqual({ users: ['first'], total: 30 });
    resolveNext({ users: ['second'], total: 30 });
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data).toEqual({ users: ['second'], total: 30 });
    expect(usersApi.listUsers).toHaveBeenLastCalledWith({ page: 2, pageSize: 25 });
  });

  it('useMedia does the same', async () => {
    mediaApi.listMedia.mockResolvedValueOnce({ media: ['a'] });
    mediaApi.listMedia.mockReturnValueOnce(new Promise(() => undefined));
    const { result, rerender } = renderHook(({ search }) => useMedia({ search }), {
      wrapper: queryWrapper(),
      initialProps: { search: '' },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ search: 'grace' });
    expect(result.current.data).toEqual({ media: ['a'] });
    expect(result.current.isPlaceholderData).toBe(true);
  });
});

it('useRoles does not fetch while disabled', async () => {
  const { result } = renderHook(() => useRoles({ enabled: false }), { wrapper: queryWrapper() });
  expect(result.current.fetchStatus).toBe('idle');
  expect(rolesApi.listRoles).not.toHaveBeenCalled();
});

/** Each mutation: its API function, the hook, the variables, the API args, invalidated keys. */
const mutationCases: MutationCase[] = [
  {
    name: 'useCreateUser',
    api: usersApi.createUser,
    useHook: useCreateUser,
    variables: { name: 'N', email: 'n@example.com', password: 'p', roleIds: [] },
    args: [{ name: 'N', email: 'n@example.com', password: 'p', roleIds: [] }],
    invalidates: [queryKeys.users.all, queryKeys.analytics.all],
  },
  {
    name: 'useUpdateUser',
    api: usersApi.updateUser,
    useHook: useUpdateUser,
    variables: { id: 'u1', input: { name: 'New' } },
    args: ['u1', { name: 'New' }],
    invalidates: [
      queryKeys.users.all,
      queryKeys.memberDetails.detail('u1'),
      queryKeys.analytics.all,
    ],
  },
  {
    name: 'useCreateMedia',
    api: mediaApi.createMedia,
    useHook: useCreateMedia,
    variables: { title: 'T', url: 'https://youtu.be/abcdefghijk', type: 'YOUTUBE_VIDEO' as const },
    args: [{ title: 'T', url: 'https://youtu.be/abcdefghijk', type: 'YOUTUBE_VIDEO' }],
    invalidates: [queryKeys.media.all],
  },
  {
    name: 'useRefreshAllEngagement',
    api: analyticsApi.refreshAllEngagement,
    useHook: useRefreshAllEngagement,
    variables: undefined,
    args: [],
    invalidates: [queryKeys.analytics.all, queryKeys.users.all, queryKeys.memberDetails.all],
  },
  {
    name: 'useCreateSavedSearch',
    api: savedApi.createSavedSearch,
    useHook: useCreateSavedSearch,
    variables: { name: 'S', query: { conditions: [], logic: 'AND' } },
    args: [{ name: 'S', query: { conditions: [], logic: 'AND' } }],
    invalidates: [queryKeys.savedSearches.all],
  },
  {
    name: 'useDeleteSavedSearch',
    api: savedApi.deleteSavedSearch,
    useHook: useDeleteSavedSearch,
    variables: 's1',
    args: ['s1'],
    invalidates: [queryKeys.savedSearches.all],
  },
  {
    name: 'useRecordSavedSearchUse',
    api: savedApi.useSavedSearch,
    useHook: useRecordSavedSearchUse,
    variables: 's1',
    args: ['s1'],
    invalidates: [queryKeys.savedSearches.all],
  },
];

describe.each(mutationCases)('$name', ({ api, useHook, variables, args, invalidates }) => {
  it('calls the API with only the variables and invalidates the affected queries', async () => {
    api.mockResolvedValue({ ok: true });
    const client = makeTestQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(useHook, { wrapper: queryWrapper(client) });
    await (result.current.mutateAsync as (v: unknown) => Promise<unknown>)(variables);
    expect(api.mock.calls[0]).toEqual(args);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(invalidates);
  });

  it('rejects with the API error and invalidates nothing', async () => {
    api.mockRejectedValue(failure);
    const client = makeTestQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(useHook, { wrapper: queryWrapper(client) });
    await expect(
      (result.current.mutateAsync as (v: unknown) => Promise<unknown>)(variables),
    ).rejects.toBe(failure);
    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
