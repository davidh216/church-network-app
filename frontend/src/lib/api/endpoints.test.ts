import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { RegisterResult } from '@/types/domain';
import * as analytics from './analytics';
import * as auth from './auth';
import * as media from './media';
import * as memberDetails from './memberDetails';
import * as roles from './roles';
import * as savedSearches from './savedSearches';
import * as users from './users';

const fetchMock = vi.fn<typeof fetch>();

function respond(body: unknown, init: ResponseInit = {}) {
  fetchMock.mockResolvedValueOnce(
    new Response(body === null ? null : JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      ...init,
    }),
  );
}

function call(index = 0): { url: string; method: string; body: unknown } {
  const [url, init = {}] = fetchMock.mock.calls[index] ?? [];
  return {
    url: String(url),
    method: init.method ?? 'GET',
    body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('auth endpoints', () => {
  it('login posts credentials and returns the user (no token handling)', async () => {
    respond({ success: true, user: { id: 'u1', name: 'Ann' } });
    await expect(auth.login('a@b.c', 'secret')).resolves.toEqual({ id: 'u1', name: 'Ann' });
    expect(call()).toEqual({
      url: '/api/auth/login',
      method: 'POST',
      body: { email: 'a@b.c', password: 'secret' },
    });
  });

  it('logout posts to /auth/logout and accepts 204', async () => {
    respond(null, { status: 204 });
    await expect(auth.logout()).resolves.toBeUndefined();
    expect(call()).toMatchObject({ url: '/api/auth/logout', method: 'POST' });
  });

  it('me returns the user', async () => {
    respond({ success: true, user: { id: 'u1' } });
    await expect(auth.me()).resolves.toEqual({ id: 'u1' });
    expect(call()).toMatchObject({ url: '/api/auth/me', method: 'GET' });
  });

  it('register returns the pending-approval result', async () => {
    // The API sends no user: the body is the same whether or not the email was already taken.
    expectTypeOf<RegisterResult>().not.toHaveProperty('user');
    const result = { success: true, pendingApproval: true, message: 'Wait' };
    respond(result, { status: 201 });
    await expect(auth.register({ email: 'a@b.c', password: 'p', name: 'A' })).resolves.toEqual(
      result,
    );
    expect(call()).toEqual({
      url: '/api/auth/register',
      method: 'POST',
      body: { email: 'a@b.c', password: 'p', name: 'A' },
    });
  });
});

describe('users endpoints', () => {
  it('listUsers returns the page and total, sending only the set params', async () => {
    const pageBody = { users: [{ id: 'u1' }], total: 26, page: 2, pageSize: 25 };
    respond({ success: true, ...pageBody });
    await expect(users.listUsers()).resolves.toEqual(pageBody);
    expect(call(0).url).toBe('/api/users');

    respond({ success: true, ...pageBody });
    await users.listUsers({
      q: ' ann ',
      role: '',
      status: 'active',
      stage: undefined,
      joinedTo: '2026-01-31',
      sort: 'name',
      order: 'desc',
      page: 2,
      pageSize: 25,
    });
    expect(call(1).url).toBe(
      '/api/users?q=ann&status=active&joinedTo=2026-01-31&sort=name&order=desc&page=2&pageSize=25',
    );
  });

  it('searchUsers posts the query and returns the page and total', async () => {
    const pageBody = { users: [{ id: 'u1' }], total: 1, page: 1, pageSize: 25 };
    respond({ success: true, ...pageBody });
    const query = {
      conditions: [
        {
          field: 'engagement.membershipStage' as const,
          operator: 'equals' as const,
          value: 'new_member' as const,
        },
        { field: 'engagement.engagementScore' as const, operator: 'gte' as const, value: 50 },
      ],
      logic: 'AND' as const,
      page: 1,
      pageSize: 25,
    };
    await expect(users.searchUsers(query)).resolves.toEqual(pageBody);
    expect(call(0)).toEqual({ url: '/api/users/search', method: 'POST', body: query });
  });

  it('getUser', async () => {
    respond({ success: true, user: { id: 'u1' } });
    await expect(users.getUser('u1')).resolves.toEqual({ id: 'u1' });
    expect(call(0).url).toBe('/api/users/u1');
  });

  it('getUserSummary returns the staff counts, or only total for a member', async () => {
    respond({ success: true, total: 9, active: 7, pendingApproval: 1, newThisMonth: 2 });
    await expect(users.getUserSummary()).resolves.toEqual({
      total: 9,
      active: 7,
      pendingApproval: 1,
      newThisMonth: 2,
    });
    expect(call(0)).toMatchObject({ url: '/api/users/summary', method: 'GET' });

    respond({ success: true, total: 7 });
    const member = await users.getUserSummary();
    expect(member.total).toBe(7);
    expect(member.active).toBeUndefined();
    expect(member).not.toHaveProperty('success');
  });

  it('createUser posts the payload including roleIds and isActive', async () => {
    respond({ success: true, user: { id: 'u3' } }, { status: 201 });
    const input = { email: 'c@d.e', password: 'pw', name: 'C', isActive: true, roleIds: ['r1'] };
    await expect(users.createUser(input)).resolves.toEqual({ id: 'u3' });
    expect(call()).toEqual({ url: '/api/users', method: 'POST', body: input });
  });

  it('updateUser puts the payload', async () => {
    respond({ success: true, user: { id: 'u1' } });
    await users.updateUser('u1', { name: 'New', phone: null });
    expect(call()).toEqual({
      url: '/api/users/u1',
      method: 'PUT',
      body: { name: 'New', phone: null },
    });
  });

  it('exportUsers requests CSV for the selection and reads the filename', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('Name\nAnn', {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="members.csv"',
        },
      }),
    );
    const file = await users.exportUsers(['u1', 'u2']);
    expect(file.filename).toBe('members.csv');
    expect(await file.blob.text()).toBe('Name\nAnn');
    expect(call().url).toBe('/api/users/export?format=csv&members=u1%2Cu2');
  });

  it('exportUsers without a selection omits members', async () => {
    fetchMock.mockResolvedValueOnce(new Response('x', { status: 200 }));
    const file = await users.exportUsers();
    expect(file.filename).toBe('members.csv');
    expect(call().url).toBe('/api/users/export?format=csv');
  });

  it('filenameFromDisposition', () => {
    expect(users.filenameFromDisposition('attachment; filename="report.csv"')).toBe('report.csv');
    expect(users.filenameFromDisposition('attachment; filename=plain.csv')).toBe('plain.csv');
    expect(users.filenameFromDisposition(null)).toBe('members.csv');
  });
});

describe('roles, media, analytics, member details', () => {
  it('listRoles', async () => {
    respond({ success: true, roles: [{ id: 'r1', name: 'admin' }] });
    await expect(roles.listRoles()).resolves.toEqual([{ id: 'r1', name: 'admin' }]);
    expect(call().url).toBe('/api/roles');
  });

  it('listMedia passes search and tag, skipping "all"', async () => {
    respond({ success: true, media: [] });
    await media.listMedia({ search: 'grace', tag: 'worship' });
    expect(call(0).url).toBe('/api/media?search=grace&tag=worship');

    respond({ success: true, media: [] });
    await media.listMedia({ search: '', tag: 'all' });
    expect(call(1).url).toBe('/api/media');
  });

  it('createMedia posts a YouTube video', async () => {
    respond({ success: true, media: { id: 'm1' } }, { status: 201 });
    const input = {
      title: 'T',
      url: 'https://youtu.be/abc',
      type: 'YOUTUBE_VIDEO' as const,
      tags: ['sermon'],
    };
    await expect(media.createMedia(input)).resolves.toEqual({ id: 'm1' });
    expect(call()).toEqual({ url: '/api/media', method: 'POST', body: input });
  });

  it('getAnalytics and refreshAllEngagement', async () => {
    respond({ success: true, analytics: { totalMembers: 3 } });
    await expect(analytics.getAnalytics()).resolves.toEqual({ totalMembers: 3 });
    expect(call(0).url).toBe('/api/analytics/members');

    respond({ success: true, message: 'Updated 3' });
    await expect(analytics.refreshAllEngagement()).resolves.toBe('Updated 3');
    expect(call(1)).toMatchObject({
      url: '/api/analytics/members/engagement/refresh-all',
      method: 'POST',
    });
  });

  it('getMemberDetails', async () => {
    respond({ success: true, user: { id: 'u1', emailOptIn: true } });
    await expect(memberDetails.getMemberDetails('u1')).resolves.toEqual({
      id: 'u1',
      emailOptIn: true,
    });
    expect(call().url).toBe('/api/member-details/u1');
  });
});

describe('saved searches endpoints', () => {
  it('list, create, delete, use', async () => {
    respond({ success: true, searches: [{ id: 's1' }] });
    await expect(savedSearches.listSavedSearches()).resolves.toEqual([{ id: 's1' }]);
    expect(call(0).url).toBe('/api/users/saved-searches');

    respond({ success: true, search: { id: 's2' } }, { status: 201 });
    const input = {
      name: 'N',
      query: {
        conditions: [{ field: 'name' as const, operator: 'contains' as const, value: 'ann' }],
        logic: 'AND' as const,
      },
      isPublic: false,
    };
    await expect(savedSearches.createSavedSearch(input)).resolves.toEqual({ id: 's2' });
    expect(call(1)).toEqual({ url: '/api/users/saved-searches', method: 'POST', body: input });

    respond({ success: true });
    await savedSearches.deleteSavedSearch('s2');
    expect(call(2)).toMatchObject({ url: '/api/users/saved-searches/s2', method: 'DELETE' });

    respond({ success: true });
    await savedSearches.useSavedSearch('s1');
    expect(call(3)).toMatchObject({ url: '/api/users/saved-searches/s1/use', method: 'POST' });
  });

  it('propagates ApiError from the client', async () => {
    respond({ error: 'Search not found' }, { status: 404 });
    await expect(savedSearches.deleteSavedSearch('missing')).rejects.toMatchObject({
      status: 404,
      message: 'Search not found',
    });
  });
});
