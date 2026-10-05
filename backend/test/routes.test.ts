import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Express } from 'express';
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import type { RoleName } from '../src/types/auth';

// The route matrix: every route mounted by createApp() is listed in ROUTES with its access level and
// one happy-path request. The first test discovers the mounted routes from the app itself, so a
// route added without an entry here fails the suite. Then every non-public route is checked for
// 401 without a session, every staff route for 403 as a member, every admin route for 403 as a
// leader, and every route answers its happy path.

// Express 5 (router@2) does not keep mount paths on its layers, so record them as routers are used.
// This must happen before the app modules load, hence the dynamic imports below.
const mountPaths = new WeakMap<object, string>();
type UseFn = (this: unknown, ...args: unknown[]) => unknown;
const routerProto = express.Router as unknown as { prototype: { use: UseFn } };
const originalUse = routerProto.prototype.use;
routerProto.prototype.use = function (this: unknown, ...args: unknown[]) {
  const [first, ...rest] = args;
  if (typeof first === 'string') {
    for (const fn of rest.flat(Infinity)) if (typeof fn === 'function') mountPaths.set(fn, first);
  }
  return originalUse.apply(this, args);
};

type Layer = {
  route?: { path: string; methods: Record<string, boolean> };
  handle: { stack?: Layer[] };
};

function listRoutes(stack: Layer[], prefix = ''): string[] {
  const out: string[] = [];
  for (const layer of stack) {
    if (layer.route) {
      const path = (prefix + layer.route.path).replace(/(.)\/$/, '$1');
      for (const [method, on] of Object.entries(layer.route.methods))
        if (on) out.push(`${method.toUpperCase()} ${path}`);
    } else if (layer.handle.stack) {
      const mount = mountPaths.get(layer.handle) ?? '';
      out.push(...listRoutes(layer.handle.stack, prefix + (mount === '/' ? '' : mount)));
    }
  }
  return out;
}

type Access = 'public' | 'auth' | 'staff' | 'admin';
type As = RoleName | 'anonymous';
type Route = {
  route: string;
  access: Access;
  // The happy path: who calls, the concrete URL, the body and the expected status.
  as: As;
  url: () => string;
  body?: () => object;
  status: number;
};

const PASSWORD = 'correct-horse-battery';
const tokens = {} as Record<RoleName, string>;
const ids = {} as Record<
  'member' | 'other' | 'resetTarget' | 'media' | 'search' | 'searchToDelete',
  string
>;

const ROUTES: Route[] = [
  { route: 'GET /health', access: 'public', as: 'anonymous', url: () => '/health', status: 200 },

  {
    route: 'POST /api/auth/register',
    access: 'public',
    as: 'anonymous',
    url: () => '/api/auth/register',
    body: () => ({
      email: 'newcomer@routes.test.local',
      password: 'a-long-new-passphrase',
      name: 'Newcomer',
    }),
    status: 201,
  },
  {
    route: 'POST /api/auth/login',
    access: 'public',
    as: 'anonymous',
    url: () => '/api/auth/login',
    body: () => ({ email: 'routes-member@routes.test.local', password: PASSWORD }),
    status: 200,
  },
  {
    route: 'POST /api/auth/logout',
    access: 'public',
    as: 'anonymous',
    url: () => '/api/auth/logout',
    status: 204,
  },
  {
    route: 'GET /api/auth/me',
    access: 'auth',
    as: 'member',
    url: () => '/api/auth/me',
    status: 200,
  },
  {
    route: 'POST /api/auth/change-password',
    access: 'auth',
    as: 'member',
    url: () => '/api/auth/change-password',
    body: () => ({ currentPassword: PASSWORD, newPassword: PASSWORD }),
    status: 200,
  },

  { route: 'GET /api/users', access: 'auth', as: 'member', url: () => '/api/users', status: 200 },
  {
    route: 'GET /api/users/export',
    access: 'staff',
    as: 'leader',
    url: () => '/api/users/export?format=json',
    status: 200,
  },
  {
    route: 'GET /api/users/summary',
    access: 'auth',
    as: 'member',
    url: () => '/api/users/summary',
    status: 200,
  },
  {
    route: 'POST /api/users/search',
    access: 'staff',
    as: 'leader',
    url: () => '/api/users/search',
    body: () => ({
      conditions: [{ field: 'email', operator: 'contains', value: 'routes' }],
      logic: 'AND',
    }),
    status: 200,
  },
  {
    route: 'POST /api/users',
    access: 'staff',
    as: 'leader',
    url: () => '/api/users',
    body: () => ({
      name: 'Made By Staff',
      email: 'made-by-staff@routes.test.local',
      password: 'a-long-new-passphrase',
    }),
    status: 201,
  },
  {
    route: 'GET /api/users/:id',
    access: 'auth',
    as: 'member',
    url: () => `/api/users/${ids.other}`,
    status: 200,
  },
  {
    route: 'PUT /api/users/:id',
    access: 'auth',
    as: 'member',
    url: () => `/api/users/${ids.member}`,
    body: () => ({ bio: 'Updated by myself' }),
    status: 200,
  },
  {
    route: 'POST /api/users/:id/reset-password',
    access: 'admin',
    as: 'admin',
    url: () => `/api/users/${ids.resetTarget}/reset-password`,
    body: () => ({ newPassword: 'reset-by-the-admin-1' }),
    status: 200,
  },

  {
    route: 'GET /api/users/saved-searches',
    access: 'auth',
    as: 'member',
    url: () => '/api/users/saved-searches',
    status: 200,
  },
  {
    route: 'POST /api/users/saved-searches',
    access: 'auth',
    as: 'member',
    url: () => '/api/users/saved-searches',
    body: () => ({
      name: 'New search',
      query: { conditions: [{ field: 'name', operator: 'isEmpty' }], logic: 'OR' },
    }),
    status: 201,
  },
  {
    route: 'DELETE /api/users/saved-searches/:id',
    access: 'auth',
    as: 'member',
    url: () => `/api/users/saved-searches/${ids.searchToDelete}`,
    status: 200,
  },
  {
    route: 'POST /api/users/saved-searches/:id/use',
    access: 'auth',
    as: 'member',
    url: () => `/api/users/saved-searches/${ids.search}/use`,
    status: 200,
  },

  { route: 'GET /api/roles', access: 'auth', as: 'member', url: () => '/api/roles', status: 200 },

  { route: 'GET /api/media', access: 'auth', as: 'member', url: () => '/api/media', status: 200 },
  {
    route: 'POST /api/media',
    access: 'staff',
    as: 'leader',
    url: () => '/api/media',
    body: () => ({
      title: 'New video',
      type: 'YOUTUBE_VIDEO',
      url: 'https://youtu.be/xyz789abc12',
    }),
    status: 201,
  },
  {
    route: 'GET /api/media/:id',
    access: 'auth',
    as: 'member',
    url: () => `/api/media/${ids.media}`,
    status: 200,
  },

  {
    route: 'GET /api/analytics/members',
    access: 'staff',
    as: 'leader',
    url: () => '/api/analytics/members',
    status: 200,
  },
  {
    route: 'POST /api/analytics/members/engagement/refresh-all',
    access: 'staff',
    as: 'leader',
    url: () => '/api/analytics/members/engagement/refresh-all',
    status: 200,
  },
  {
    route: 'GET /api/analytics/members/:id/engagement',
    access: 'staff',
    as: 'leader',
    url: () => `/api/analytics/members/${ids.member}/engagement`,
    status: 200,
  },
  {
    route: 'POST /api/analytics/members/:id/engagement/refresh',
    access: 'staff',
    as: 'leader',
    url: () => `/api/analytics/members/${ids.member}/engagement/refresh`,
    status: 200,
  },
  {
    route: 'GET /api/analytics/members/:id/trends',
    access: 'staff',
    as: 'leader',
    url: () => `/api/analytics/members/${ids.member}/trends`,
    status: 200,
  },
  {
    route: 'POST /api/analytics/members/:id/activities',
    access: 'staff',
    as: 'leader',
    url: () => `/api/analytics/members/${ids.member}/activities`,
    body: () => ({ activityType: 'service_attendance', points: 2 }),
    status: 200,
  },
  {
    route: 'POST /api/analytics/members/:id/interactions',
    access: 'staff',
    as: 'leader',
    url: () => `/api/analytics/members/${ids.member}/interactions`,
    body: () => ({ interactionType: 'email_opened', channel: 'email' }),
    status: 200,
  },

  {
    route: 'GET /api/member-details/:id',
    access: 'staff',
    as: 'leader',
    url: () => `/api/member-details/${ids.member}`,
    status: 200,
  },
  {
    route: 'GET /api/member-details/:id/timeline',
    access: 'staff',
    as: 'leader',
    url: () => `/api/member-details/${ids.member}/timeline`,
    status: 200,
  },
  {
    route: 'GET /api/member-details/:id/interactions',
    access: 'staff',
    as: 'leader',
    url: () => `/api/member-details/${ids.member}/interactions`,
    status: 200,
  },
  {
    route: 'GET /api/member-details/:id/milestones',
    access: 'staff',
    as: 'leader',
    url: () => `/api/member-details/${ids.member}/milestones`,
    status: 200,
  },
  {
    route: 'GET /api/member-details/:id/notes',
    access: 'staff',
    as: 'leader',
    url: () => `/api/member-details/${ids.member}/notes`,
    status: 200,
  },
  {
    route: 'POST /api/member-details/:id/interactions',
    access: 'staff',
    as: 'leader',
    url: () => `/api/member-details/${ids.member}/interactions`,
    body: () => ({ interactionType: 'call_made', channel: 'phone' }),
    status: 200,
  },
  {
    route: 'POST /api/member-details/:id/milestones',
    access: 'staff',
    as: 'leader',
    url: () => `/api/member-details/${ids.member}/milestones`,
    body: () => ({ milestoneType: 'baptism', title: 'Baptised', achievedDate: '2026-05-01' }),
    status: 200,
  },
  {
    route: 'POST /api/member-details/:id/notes',
    access: 'staff',
    as: 'leader',
    url: () => `/api/member-details/${ids.member}/notes`,
    body: () => ({ content: 'Pastoral visit' }),
    status: 200,
  },
];

const methodOf = (r: Route) =>
  r.route.split(' ')[0]!.toLowerCase() as 'get' | 'post' | 'put' | 'delete';

let app: Express;

function call(r: Route, as: As) {
  let req = request(app)[methodOf(r)](r.url());
  if (as !== 'anonymous') req = req.set('Authorization', `Bearer ${tokens[as]}`);
  const body = r.body?.();
  return body ? req.send(body) : req;
}

describe('route matrix', () => {
  beforeAll(async () => {
    const helpers = await import('./helpers.js');
    app = helpers.app;
    await helpers.resetDatabase();
    const admin = await helpers.createUser({
      email: 'routes-admin@routes.test.local',
      role: 'admin',
    });
    await helpers.createUser({ email: 'routes-leader@routes.test.local', role: 'leader' });
    ids.member = (
      await helpers.createUser({ email: 'routes-member@routes.test.local', role: 'member' })
    ).id;
    ids.other = (
      await helpers.createUser({ email: 'routes-other@routes.test.local', role: 'member' })
    ).id;
    ids.resetTarget = (
      await helpers.createUser({ email: 'routes-reset@routes.test.local', role: 'member' })
    ).id;
    ids.media = (
      await prisma.media.create({
        data: {
          title: 'Seed video',
          type: 'YOUTUBE_VIDEO',
          url: 'https://youtu.be/abc123',
          tags: [],
          uploadedById: admin.id,
        },
      })
    ).id;
    ids.search = (
      await prisma.savedSearch.create({
        data: { name: 'Kept', query: '{}', createdById: ids.member },
      })
    ).id;
    ids.searchToDelete = (
      await prisma.savedSearch.create({
        data: { name: 'Doomed', query: '{}', createdById: ids.member },
      })
    ).id;
    for (const role of ['admin', 'leader', 'member'] as RoleName[])
      tokens[role] = await helpers.login(`routes-${role}@routes.test.local`);
  });

  it('lists every route mounted by the app, and only those', () => {
    const mounted = listRoutes((app as unknown as { router: { stack: Layer[] } }).router.stack);
    expect([...mounted].sort()).toEqual(ROUTES.map((r) => r.route).sort());
  });

  const gated = ROUTES.filter((r) => r.access !== 'public');
  it.each(gated)('$route without a session -> 401', async (r) => {
    expect((await call(r, 'anonymous')).status).toBe(401);
  });

  it.each(gated)('$route with an invalid token -> 401', async (r) => {
    const res = await request(app)[methodOf(r)](r.url()).set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it.each(ROUTES.filter((r) => r.access === 'staff' || r.access === 'admin'))(
    '$route as a member -> 403',
    async (r) => {
      const res = await call(r, 'member');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Insufficient permissions');
    },
  );

  it.each(ROUTES.filter((r) => r.access === 'admin'))('$route as a leader -> 403', async (r) => {
    expect((await call(r, 'leader')).status).toBe(403);
  });

  // Routes open to every signed-in user that act only on the caller's own records.
  it("a member cannot edit another profile or delete or use another user's saved search", async () => {
    expect(
      (
        await request(app)
          .put(`/api/users/${ids.other}`)
          .set('Authorization', `Bearer ${tokens.member}`)
          .send({ bio: 'x' })
      ).status,
    ).toBe(403);
    const theirs = await prisma.savedSearch.create({
      data: { name: 'Private', query: '{}', createdById: ids.other, isPublic: false },
    });
    expect(
      (
        await request(app)
          .delete(`/api/users/saved-searches/${theirs.id}`)
          .set('Authorization', `Bearer ${tokens.member}`)
      ).status,
    ).toBe(403);
    // A private search of someone else is reported as missing rather than forbidden.
    expect(
      (
        await request(app)
          .post(`/api/users/saved-searches/${theirs.id}/use`)
          .set('Authorization', `Bearer ${tokens.member}`)
      ).status,
    ).toBe(404);
    expect(
      (await prisma.savedSearch.findUniqueOrThrow({ where: { id: theirs.id } })).usageCount,
    ).toBe(0);
  });

  it.each(ROUTES)('$route happy path', async (r) => {
    const res = await call(r, r.as);
    expect(res.status, JSON.stringify(res.body)).toBe(r.status);
    if (r.status !== 204 && r.route !== 'GET /health') expect(res.body.success).toBe(true);
  });
});
