import { act, renderHook, waitFor } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { EngagementJob } from '@embrace/shared';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ApiError } from '@/lib/api/client';
import { makeTestQueryClient, queryWrapper } from '@/test/render';
import { useAnalytics, useRefreshAllEngagement } from './analytics';
import { queryKeys } from './keys';
import { useCreateMedia, useMedia } from './media';
import { useMemberAttendance, useMemberDetails, useOwnAttendance } from './memberDetails';
import { useRoles } from './roles';
import {
  useCreateService,
  useDeleteService,
  useSaveAttendance,
  useServiceAttendance,
  useServices,
  useUpdateService,
} from './services';
import {
  useCreateSavedSearch,
  useDeleteSavedSearch,
  useRecordSavedSearchUse,
  useSavedSearches,
} from './savedSearches';
import { useCreateUser, useMemberRows, useUpdateUser, useUser, useUserSummary } from './users';

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
const analyticsApi = vi.hoisted(() => ({
  getAnalytics: vi.fn(),
  refreshAllEngagement: vi.fn(),
  getEngagementJob: vi.fn(),
}));
vi.mock('@/lib/api/analytics', () => analyticsApi);
const rolesApi = vi.hoisted(() => ({ listRoles: vi.fn() }));
vi.mock('@/lib/api/roles', () => rolesApi);
const detailsApi = vi.hoisted(() => ({
  getMemberDetails: vi.fn(),
  getMemberAttendance: vi.fn(),
  getOwnAttendance: vi.fn(),
}));
vi.mock('@/lib/api/memberDetails', () => detailsApi);
const servicesApi = vi.hoisted(() => ({
  listServices: vi.fn(),
  createService: vi.fn(),
  updateService: vi.fn(),
  deleteService: vi.fn(),
  getServiceAttendance: vi.fn(),
  saveServiceAttendance: vi.fn(),
}));
vi.mock('@/lib/api/services', () => servicesApi);
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
    name: 'useMemberRows (list)',
    api: usersApi.listUsers,
    useHook: () => useMemberRows({ kind: 'list', params: { q: 'ann', page: 2, pageSize: 25 } }),
    args: [{ q: 'ann', page: 2, pageSize: 25 }, expect.any(AbortSignal)],
  },
  {
    name: 'useMemberRows (search)',
    api: usersApi.searchUsers,
    useHook: () => useMemberRows({ kind: 'search', query: stageQuery }),
    args: [stageQuery, expect.any(AbortSignal)],
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
    name: 'useMemberAttendance',
    api: detailsApi.getMemberAttendance,
    useHook: () => useMemberAttendance('u1', { months: 6, types: ['sunday_service'] }),
    args: ['u1', { months: 6, types: ['sunday_service'] }, expect.any(AbortSignal)],
  },
  {
    name: 'useOwnAttendance',
    api: detailsApi.getOwnAttendance,
    useHook: () => useOwnAttendance(),
    args: [{}, expect.any(AbortSignal)],
  },
  {
    name: 'useServices',
    api: servicesApi.listServices,
    useHook: () => useServices({ from: '2026-10-01', to: '2026-10-31', pageSize: 1 }),
    args: [{ from: '2026-10-01', to: '2026-10-31', pageSize: 1 }, expect.any(AbortSignal)],
  },
  {
    name: 'useServiceAttendance',
    api: servicesApi.getServiceAttendance,
    useHook: () => useServiceAttendance('s1'),
    args: ['s1', expect.any(AbortSignal)],
  },
  {
    name: 'useMedia',
    api: mediaApi.listMedia,
    useHook: () => useMedia({ search: 'grace', page: 1, pageSize: 24 }),
    args: [{ search: 'grace', page: 1, pageSize: 24 }, expect.any(AbortSignal)],
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

describe('useMemberRows', () => {
  it('caches searches under the users prefix, so member invalidations refetch them', async () => {
    usersApi.searchUsers.mockResolvedValue({ users: [], total: 0, page: 1, pageSize: 25 });
    const client = makeTestQueryClient();
    const { result } = renderHook(() => useMemberRows({ kind: 'search', query: stageQuery }), {
      wrapper: queryWrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(queryKeys.users.search(stageQuery))).toBeDefined();
    await client.invalidateQueries({ queryKey: queryKeys.users.all });
    await waitFor(() => expect(usersApi.searchUsers).toHaveBeenCalledTimes(2));
  });
});

describe('list hooks keep the previous page while the next loads', () => {
  it('useMemberRows shows the old page as placeholder data under the new key', async () => {
    usersApi.listUsers.mockResolvedValueOnce({ users: ['first'], total: 30 });
    let resolveNext: (value: unknown) => void = () => undefined;
    usersApi.listUsers.mockReturnValueOnce(new Promise((resolve) => (resolveNext = resolve)));
    const { result, rerender } = renderHook(
      ({ page }) => useMemberRows({ kind: 'list', params: { page, pageSize: 25 } }),
      { wrapper: queryWrapper(), initialProps: { page: 1 } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ page: 2 });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data).toEqual({ users: ['first'], total: 30 });
    resolveNext({ users: ['second'], total: 30 });
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data).toEqual({ users: ['second'], total: 30 });
    expect(usersApi.listUsers).toHaveBeenLastCalledWith(
      { page: 2, pageSize: 25 },
      expect.any(AbortSignal),
    );
  });

  it('useMemberRows keeps the list rows while switching to a search (no empty flash)', async () => {
    usersApi.listUsers.mockResolvedValueOnce({ users: ['listed'], total: 3 });
    usersApi.searchUsers.mockReturnValueOnce(new Promise(() => undefined));
    const { result, rerender } = renderHook(
      ({ advanced }) =>
        useMemberRows(
          advanced
            ? { kind: 'search', query: stageQuery }
            : { kind: 'list', params: { page: 1, pageSize: 25 } },
        ),
      { wrapper: queryWrapper(), initialProps: { advanced: false } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ advanced: true });
    expect(usersApi.searchUsers).toHaveBeenCalled();
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data).toEqual({ users: ['listed'], total: 3 });
  });

  it('aborts the superseded request', async () => {
    const signals: AbortSignal[] = [];
    mediaApi.listMedia.mockImplementation((_params: unknown, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise(() => undefined);
    });
    const { rerender } = renderHook(({ search }) => useMedia({ search }), {
      wrapper: queryWrapper(),
      initialProps: { search: 'g' },
    });
    await waitFor(() => expect(signals).toHaveLength(1));
    rerender({ search: 'grace' });
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
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

it('useServices does not fetch while disabled', async () => {
  const { result } = renderHook(() => useServices({}, { enabled: false }), {
    wrapper: queryWrapper(),
  });
  expect(result.current.fetchStatus).toBe('idle');
  expect(servicesApi.listServices).not.toHaveBeenCalled();
});

it('attendance summaries sit under the member-details prefix, so a member save refetches them', async () => {
  detailsApi.getMemberAttendance.mockResolvedValue({ attended: [] });
  const client = makeTestQueryClient();
  const { result } = renderHook(() => useMemberAttendance('u1', { months: 12 }), {
    wrapper: queryWrapper(client),
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  await client.invalidateQueries({ queryKey: queryKeys.memberDetails.detail('u1') });
  await waitFor(() => expect(detailsApi.getMemberAttendance).toHaveBeenCalledTimes(2));
});

it('attendance sheets sit under the services prefix, so a service change refetches them', async () => {
  servicesApi.getServiceAttendance.mockResolvedValue({ service: {}, members: [] });
  const client = makeTestQueryClient();
  const { result } = renderHook(() => useServiceAttendance('s1'), {
    wrapper: queryWrapper(client),
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(client.getQueryData(queryKeys.services.attendance('s1'))).toBeDefined();
  await client.invalidateQueries({ queryKey: queryKeys.services.all });
  await waitFor(() => expect(servicesApi.getServiceAttendance).toHaveBeenCalledTimes(2));
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
    name: 'useCreateService',
    api: servicesApi.createService,
    useHook: useCreateService,
    variables: { date: '2026-10-04', type: 'sunday_service' },
    args: [{ date: '2026-10-04', type: 'sunday_service' }],
    invalidates: [queryKeys.services.all, queryKeys.memberDetails.all],
  },
  {
    name: 'useUpdateService',
    api: servicesApi.updateService,
    useHook: useUpdateService,
    variables: { id: 's1', input: { title: 'Harvest' } },
    args: ['s1', { title: 'Harvest' }],
    invalidates: [queryKeys.services.all, queryKeys.memberDetails.all],
  },
  {
    name: 'useDeleteService',
    api: servicesApi.deleteService,
    useHook: useDeleteService,
    variables: 's1',
    args: ['s1'],
    invalidates: [queryKeys.services.all, queryKeys.memberDetails.all],
  },
  {
    name: 'useSaveAttendance',
    api: servicesApi.saveServiceAttendance,
    useHook: useSaveAttendance,
    variables: { id: 's1', input: { present: ['u1'], absent: [] } },
    args: ['s1', { present: ['u1'], absent: [] }],
    invalidates: [queryKeys.services.all, queryKeys.memberDetails.all],
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

describe('useRefreshAllEngagement', () => {
  const job = (patch: Partial<EngagementJob> = {}): EngagementJob => ({
    jobId: 'job-1',
    status: 'running',
    processed: 0,
    failed: 0,
    skipped: 0,
    total: 3,
    startedAt: '2026-10-05T10:00:00.000Z',
    finishedAt: null,
    ...patch,
  });
  const scoreKeys = [queryKeys.analytics.all, queryKeys.users.all, queryKeys.memberDetails.all];

  function setup(options = { pollMs: 5, timeoutMs: 120_000 }) {
    const client = makeTestQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const hook = renderHook(() => useRefreshAllEngagement(options), {
      wrapper: queryWrapper(client),
    });
    const invalidated = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    return { ...hook, invalidated };
  }

  it('polls the 202 job until it completes and only then refetches scores', async () => {
    analyticsApi.refreshAllEngagement.mockResolvedValue(job());
    let current = job({ processed: 1 });
    analyticsApi.getEngagementJob.mockImplementation(() => Promise.resolve(current));
    const { result, invalidated } = setup();
    act(() => result.current.start());
    await waitFor(() => expect(result.current.job?.processed).toBe(1));
    await waitFor(() => expect(analyticsApi.getEngagementJob.mock.calls.length).toBeGreaterThan(2));
    expect(result.current.refreshing).toBe(true);
    expect(invalidated()).toEqual([]);

    current = job({ status: 'completed', processed: 3 });
    await waitFor(() => expect(result.current.job?.status).toBe('completed'));
    await waitFor(() => expect(invalidated()).toEqual(scoreKeys));
    expect(result.current.refreshing).toBe(false);
    expect(result.current.error).toBeNull();
    expect(analyticsApi.getEngagementJob).toHaveBeenCalledWith('job-1');
    const polls = analyticsApi.getEngagementJob.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(analyticsApi.getEngagementJob.mock.calls.length).toBe(polls);
    expect(invalidated()).toEqual(scoreKeys);
  });

  it('refetches scores after a failed job too (some members may have been updated)', async () => {
    analyticsApi.refreshAllEngagement.mockResolvedValue(job());
    analyticsApi.getEngagementJob.mockResolvedValue(job({ status: 'failed' }));
    const { result, invalidated } = setup();
    act(() => result.current.start());
    await waitFor(() => expect(result.current.job?.status).toBe('failed'));
    await waitFor(() => expect(invalidated()).toEqual(scoreKeys));
    expect(result.current.refreshing).toBe(false);
  });

  it('reports a failed start and refetches nothing', async () => {
    analyticsApi.refreshAllEngagement.mockRejectedValue(failure);
    const { result, invalidated } = setup();
    act(() => result.current.start());
    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(result.current.refreshing).toBe(false);
    expect(analyticsApi.getEngagementJob).not.toHaveBeenCalled();
    expect(invalidated()).toEqual([]);
  });

  it('stops polling with the error when the job is gone (404 after an API restart)', async () => {
    const gone = new ApiError(404, 'Job not found');
    analyticsApi.refreshAllEngagement.mockResolvedValue(job());
    analyticsApi.getEngagementJob.mockRejectedValue(gone);
    const { result, invalidated } = setup();
    act(() => result.current.start());
    await waitFor(() => expect(result.current.error).toBe(gone));
    expect(result.current.refreshing).toBe(false);
    const polls = analyticsApi.getEngagementJob.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(analyticsApi.getEngagementJob.mock.calls.length).toBe(polls);
    expect(invalidated()).toEqual([]);
  });

  it('gives up after the timeout while the job is still running', async () => {
    analyticsApi.refreshAllEngagement.mockResolvedValue(job());
    analyticsApi.getEngagementJob.mockResolvedValue(job({ processed: 1 }));
    const { result, invalidated } = setup({ pollMs: 5, timeoutMs: 40 });
    act(() => result.current.start());
    await waitFor(() => expect(result.current.timedOut).toBe(true));
    expect(result.current.refreshing).toBe(false);
    const polls = analyticsApi.getEngagementJob.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(analyticsApi.getEngagementJob.mock.calls.length).toBe(polls);
    expect(invalidated()).toEqual([]);
  });
});
