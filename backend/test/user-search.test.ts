import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { BETWEEN_ORDER_MESSAGE, SEARCH_FIELD_OPERATORS, type SearchField } from '@embrace/shared';
import { prisma } from '../src/lib/prisma';
import { endOfDay } from '../src/modules/users/search';
import { app, bearer, createUser, login, resetDatabase } from './helpers';

// GET /api/users filters, sorting and paging, and POST /api/users/search (PHASE2_SPECS 1.2, S2).
//
// Fixture (Dan is the admin who searches, Bob the leader, Alice a member, Carol inactive):
//   name          phone        bio                 roles   score stage        risk   created               last login
//   Alice Anders  555-0101     Sings in the choir  member  80    core_member  low    2026-01-10            2026-09-15T10:00Z
//   Bob Brown     null         null                leader  45    new_member   medium 2026-02-20T15:00Z     null
//   Carol Cruz    +1 555 0303  ''                  member  20    at_risk      high   2026-03-05T18:00Z     2026-08-01
//   Dan Diaz      555-0404     CHOIR director      admin   (no engagement row)        2026-03-31T23:30Z     2026-10-01T12:00Z

type Name = 'Alice Anders' | 'Bob Brown' | 'Carol Cruz' | 'Dan Diaz';
const ALL: Name[] = ['Alice Anders', 'Bob Brown', 'Carol Cruz', 'Dan Diaz'];
const email = (first: string) => `${first}@search.test.local`;

let adminToken: string;
let leaderToken: string;
let memberToken: string;

beforeAll(async () => {
  await resetDatabase();
  const alice = await createUser({ email: email('alice'), role: 'member', name: 'Alice Anders' });
  const bob = await createUser({ email: email('bob'), role: 'leader', name: 'Bob Brown' });
  const carol = await createUser({ email: email('carol'), role: 'member', name: 'Carol Cruz' });
  const dan = await createUser({ email: email('dan'), role: 'admin', name: 'Dan Diaz' });
  // Log in first: login stamps lastLoginAt, which the fixture then overwrites.
  adminToken = await login(email('dan'));
  leaderToken = await login(email('bob'));
  memberToken = await login(email('alice'));
  const rows = [
    [
      alice.id,
      '555-0101',
      'Sings in the choir',
      true,
      '2026-01-10T00:00:00Z',
      '2026-09-15T10:00:00Z',
    ],
    [bob.id, null, null, true, '2026-02-20T15:00:00Z', null],
    [carol.id, '+1 555 0303', '', false, '2026-03-05T18:00:00Z', '2026-08-01T00:00:00Z'],
    [dan.id, '555-0404', 'CHOIR director', true, '2026-03-31T23:30:00Z', '2026-10-01T12:00:00Z'],
  ] as const;
  for (const [id, phone, bio, isActive, createdAt, lastLoginAt] of rows) {
    await prisma.user.update({
      where: { id },
      data: {
        phone,
        bio,
        isActive,
        createdAt: new Date(createdAt),
        lastLoginAt: lastLoginAt ? new Date(lastLoginAt) : null,
      },
    });
  }
  await prisma.memberEngagement.createMany({
    data: [
      { userId: alice.id, engagementScore: 80, membershipStage: 'core_member', riskLevel: 'low' },
      { userId: bob.id, engagementScore: 45, membershipStage: 'new_member', riskLevel: 'medium' },
      { userId: carol.id, engagementScore: 20, membershipStage: 'at_risk', riskLevel: 'high' },
    ],
  });
});

const names = (body: { users: { name: string }[] }) => body.users.map((u) => u.name);
const sorted = (body: { users: { name: string }[] }) => names(body).sort();

function search(body: object, token = adminToken) {
  return request(app).post('/api/users/search').set(bearer(token)).send(body);
}

function list(query: string, token = adminToken) {
  return request(app).get(`/api/users?${query}`).set(bearer(token));
}

// Every allowed field/operator pair with a value and the users it must match.
const CASES: Record<SearchField, Record<string, { value?: unknown; matches: Name[] }>> = {
  name: {
    contains: { value: 'AN', matches: ['Alice Anders', 'Dan Diaz'] },
    equals: { value: 'alice anders', matches: ['Alice Anders'] },
    startsWith: { value: 'c', matches: ['Carol Cruz'] },
    isEmpty: { matches: [] },
  },
  email: {
    contains: { value: 'BOB@', matches: ['Bob Brown'] },
    equals: { value: 'CAROL@search.test.local', matches: ['Carol Cruz'] },
    startsWith: { value: 'Da', matches: ['Dan Diaz'] },
    isEmpty: { matches: [] },
  },
  phone: {
    contains: { value: '555', matches: ['Alice Anders', 'Carol Cruz', 'Dan Diaz'] },
    equals: { value: '555-0404', matches: ['Dan Diaz'] },
    startsWith: { value: '+1', matches: ['Carol Cruz'] },
    isEmpty: { matches: ['Bob Brown'] },
  },
  bio: {
    contains: { value: 'choir', matches: ['Alice Anders', 'Dan Diaz'] },
    equals: { value: 'choir director', matches: ['Dan Diaz'] },
    startsWith: { value: 'SINGS', matches: ['Alice Anders'] },
    // A missing (null) and a blank ('') bio both count as empty.
    isEmpty: { matches: ['Bob Brown', 'Carol Cruz'] },
  },
  roles: {
    includes: { value: 'Leader', matches: ['Bob Brown'] },
  },
  'engagement.engagementScore': {
    gt: { value: 45, matches: ['Alice Anders'] },
    gte: { value: 45, matches: ['Alice Anders', 'Bob Brown'] },
    lt: { value: 45, matches: ['Carol Cruz'] },
    lte: { value: 45, matches: ['Bob Brown', 'Carol Cruz'] },
    between: { value: [20, 45], matches: ['Bob Brown', 'Carol Cruz'] },
  },
  'engagement.membershipStage': {
    equals: { value: 'new_member', matches: ['Bob Brown'] },
    in: { value: ['core_member', 'at_risk'], matches: ['Alice Anders', 'Carol Cruz'] },
  },
  'engagement.riskLevel': {
    equals: { value: 'high', matches: ['Carol Cruz'] },
    in: { value: ['low', 'medium'], matches: ['Alice Anders', 'Bob Brown'] },
  },
  // Calendar dates are whole UTC days: before and after exclude the day, between includes both.
  createdAt: {
    before: { value: '2026-02-20', matches: ['Alice Anders'] },
    after: { value: '2026-03-05', matches: ['Dan Diaz'] },
    between: { value: ['2026-02-20', '2026-03-05'], matches: ['Bob Brown', 'Carol Cruz'] },
  },
  lastLoginAt: {
    before: { value: '2026-09-01', matches: ['Carol Cruz'] },
    after: { value: '2026-09-15', matches: ['Dan Diaz'] },
    between: { value: ['2026-08-01', '2026-09-15'], matches: ['Alice Anders', 'Carol Cruz'] },
  },
  isActive: {
    equals: { value: false, matches: ['Carol Cruz'] },
  },
};

const PAIRS = (Object.keys(SEARCH_FIELD_OPERATORS) as SearchField[]).flatMap((field) =>
  SEARCH_FIELD_OPERATORS[field].map((operator) => ({ field, operator })),
);

describe('POST /api/users/search', () => {
  it('has a case for exactly the allowed field/operator pairs', () => {
    for (const field of Object.keys(SEARCH_FIELD_OPERATORS) as SearchField[]) {
      expect(Object.keys(CASES[field]).sort()).toEqual([...SEARCH_FIELD_OPERATORS[field]].sort());
    }
  });

  it.each(PAIRS)('$field $operator', async ({ field, operator }) => {
    const { value, matches } = CASES[field][operator]!;
    const condition = value === undefined ? { field, operator } : { field, operator, value };
    const res = await search({ conditions: [condition], logic: 'AND' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(sorted(res.body)).toEqual(matches);
    expect(res.body.total).toBe(matches.length);
  });

  it('matches timestamps exactly', async () => {
    const at = (operator: string, value: unknown) =>
      search({ conditions: [{ field: 'createdAt', operator, value }], logic: 'AND' });
    expect(names((await at('after', '2026-03-31T23:00:00Z')).body)).toEqual(['Dan Diaz']);
    expect(names((await at('before', '2026-01-10T00:00:01Z')).body)).toEqual(['Alice Anders']);
    expect(
      sorted((await at('between', ['2026-02-20T15:00:00Z', '2026-03-05T18:00:00+00:00'])).body),
    ).toEqual(['Bob Brown', 'Carol Cruz']);
  });

  it('accepts the last representable day, 9999-12-31, with inclusive bounds', async () => {
    const at = async (field: string, operator: string, value: unknown) => {
      const res = await search({ conditions: [{ field, operator, value }], logic: 'AND' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      return sorted(res.body);
    };
    expect(await at('createdAt', 'after', '9999-12-31')).toEqual([]);
    expect(await at('lastLoginAt', 'after', '9999-12-31')).toEqual([]);
    expect(await at('createdAt', 'between', ['2026-02-20', '9999-12-31'])).toEqual([
      'Bob Brown',
      'Carol Cruz',
      'Dan Diaz',
    ]);
    expect(await at('lastLoginAt', 'between', ['2026-08-01', '9999-12-31'])).toEqual([
      'Alice Anders',
      'Carol Cruz',
      'Dan Diaz',
    ]);
    expect(await at('createdAt', 'between', ['9999-12-31', '9999-12-31'])).toEqual([]);
  });

  it('includes the last millisecond of the day in between and excludes it from after', async () => {
    const dan = await prisma.user.findUniqueOrThrow({ where: { email: email('dan') } });
    await prisma.user.update({
      where: { id: dan.id },
      data: { createdAt: new Date('2026-03-31T23:59:59.999Z') },
    });
    try {
      const at = async (operator: string, value: unknown) =>
        names(
          (await search({ conditions: [{ field: 'createdAt', operator, value }], logic: 'AND' }))
            .body,
        );
      expect(await at('between', ['2026-03-31', '2026-03-31'])).toEqual(['Dan Diaz']);
      expect(await at('after', '2026-03-30')).toEqual(['Dan Diaz']);
      expect(await at('after', '2026-03-31')).toEqual([]);
      expect(names((await list('joinedFrom=2026-03-31&joinedTo=2026-03-31')).body)).toEqual([
        'Dan Diaz',
      ]);
      expect(names((await list('joinedTo=2026-03-30')).body)).not.toContain('Dan Diaz');
    } finally {
      await prisma.user.update({ where: { id: dan.id }, data: { createdAt: dan.createdAt } });
    }
  });

  it('combines conditions with AND', async () => {
    const res = await search({
      conditions: [
        { field: 'engagement.membershipStage', operator: 'in', value: ['core_member', 'at_risk'] },
        { field: 'isActive', operator: 'equals', value: true },
      ],
      logic: 'AND',
    });
    expect(names(res.body)).toEqual(['Alice Anders']);
  });

  it('combines conditions with OR', async () => {
    const res = await search({
      conditions: [
        { field: 'roles', operator: 'includes', value: 'leader' },
        { field: 'engagement.riskLevel', operator: 'equals', value: 'high' },
      ],
      logic: 'OR',
    });
    expect(sorted(res.body)).toEqual(['Bob Brown', 'Carol Cruz']);
  });

  it('returns staff fields, the total and the page', async () => {
    const res = await search({
      conditions: [{ field: 'name', operator: 'equals', value: 'Bob Brown' }],
      logic: 'AND',
    });
    expect(res.body).toMatchObject({ success: true, total: 1, page: 1, pageSize: 25 });
    expect(res.body.users[0].email).toBe(email('bob'));
    expect(res.body.users[0].engagement.engagementScore).toBe(45);
    expect(res.body.users[0].password).toBeUndefined();
  });

  it('sorts in both directions and pages the result', async () => {
    const scored = [{ field: 'engagement.engagementScore', operator: 'gte', value: 0 }];
    const asc = await search({ conditions: scored, logic: 'AND', sort: 'engagementScore' });
    expect(names(asc.body)).toEqual(['Carol Cruz', 'Bob Brown', 'Alice Anders']);
    const desc = await search({
      conditions: scored,
      logic: 'AND',
      sort: 'engagementScore',
      order: 'desc',
    });
    expect(names(desc.body)).toEqual(['Alice Anders', 'Bob Brown', 'Carol Cruz']);
    const page2 = await search({
      conditions: scored,
      logic: 'AND',
      sort: 'engagementScore',
      order: 'desc',
      page: 2,
      pageSize: 2,
    });
    expect(page2.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(names(page2.body)).toEqual(['Carol Cruz']);
  });

  it.each([
    ['an unknown field', { conditions: [{ field: 'password', operator: 'equals', value: 'x' }] }],
    ['an unknown operator', { conditions: [{ field: 'name', operator: 'like', value: 'x' }] }],
    [
      'an operator not allowed on the field',
      { conditions: [{ field: 'isActive', operator: 'contains', value: 'x' }] },
    ],
    [
      'a value of the wrong type',
      { conditions: [{ field: 'engagement.engagementScore', operator: 'gt', value: 'high' }] },
    ],
    [
      'between with one value',
      { conditions: [{ field: 'createdAt', operator: 'between', value: ['2026-01-01'] }] },
    ],
    ['no conditions', { conditions: [] }],
    [
      'more than 10 conditions',
      { conditions: Array(11).fill({ field: 'isActive', operator: 'equals', value: true }) },
    ],
  ])('rejects %s with 400 VALIDATION', async (_label, body) => {
    const res = await search({ logic: 'AND', ...body });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  });

  it.each([
    ['score', { field: 'engagement.engagementScore', operator: 'between', value: [80, 20] }],
    ['date', { field: 'createdAt', operator: 'between', value: ['2026-03-05', '2026-02-20'] }],
    [
      'timestamp',
      {
        field: 'lastLoginAt',
        operator: 'between',
        value: ['2026-09-15T10:00:01Z', '2026-09-15T10:00:00Z'],
      },
    ],
  ])('rejects a reversed %s between with 400', async (_label, condition) => {
    const res = await search({ conditions: [condition], logic: 'AND' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.details.conditions).toEqual([BETWEEN_ORDER_MESSAGE]);
  });

  it('rejects a bad logic, sort or page size with 400', async () => {
    const conditions = [{ field: 'isActive', operator: 'equals', value: true }];
    for (const extra of [
      { logic: 'XOR' },
      { logic: 'AND', sort: 'password' },
      { logic: 'AND', pageSize: 101 },
      { logic: 'AND', page: 0 },
      { logic: 'AND', page: 100_001 },
    ]) {
      expect((await search({ conditions, ...extra })).status, JSON.stringify(extra)).toBe(400);
    }
  });

  it('is staff-only', async () => {
    const body = { conditions: [{ field: 'isActive', operator: 'equals', value: true }] };
    expect((await search({ ...body, logic: 'AND' }, memberToken)).status).toBe(403);
    expect((await search({ ...body, logic: 'AND' }, leaderToken)).status).toBe(200);
  });
});

describe('GET /api/users', () => {
  it('returns every account to staff with the paging envelope', async () => {
    const res = await list('');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, total: 4, page: 1, pageSize: 25 });
    expect(names(res.body)).toEqual(ALL);
  });

  it('pages with page and pageSize', async () => {
    const page2 = await list('pageSize=3&page=2');
    expect(page2.body).toMatchObject({ total: 4, page: 2, pageSize: 3 });
    expect(names(page2.body)).toEqual(['Dan Diaz']);
    const beyond = await list('pageSize=3&page=3');
    expect(beyond.body).toMatchObject({ total: 4, page: 3, users: [] });
  });

  it('rejects out-of-range paging and unknown sorts with 400', async () => {
    for (const query of [
      'pageSize=101',
      'pageSize=0',
      'page=0',
      'page=100001',
      'page=x',
      'sort=password',
    ]) {
      const res = await list(query);
      expect(res.status, query).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
    }
  });

  it('ignores a blank q or role and returns the unfiltered page', async () => {
    for (const query of ['q=', 'role=', 'q=&role=', 'q=%20%20', 'role=%20']) {
      const res = await list(query);
      expect(res.status, query).toBe(200);
      expect(res.body, query).toMatchObject({ total: 4, page: 1, pageSize: 25 });
      expect(names(res.body), query).toEqual(ALL);
    }
  });

  it('lets staff search name, email, phone and bio case-insensitively', async () => {
    expect(names((await list('q=BOB%40')).body)).toEqual(['Bob Brown']);
    expect(names((await list('q=0303')).body)).toEqual(['Carol Cruz']);
    expect(names((await list('q=choir')).body)).toEqual(['Alice Anders', 'Dan Diaz']);
    expect(names((await list('q=cRuZ')).body)).toEqual(['Carol Cruz']);
  });

  it('filters by role, status, stage, risk and inclusive join dates', async () => {
    expect(names((await list('role=leader')).body)).toEqual(['Bob Brown']);
    expect(names((await list('status=inactive')).body)).toEqual(['Carol Cruz']);
    expect(names((await list('status=active')).body)).toEqual([
      'Alice Anders',
      'Bob Brown',
      'Dan Diaz',
    ]);
    expect(names((await list('stage=new_member')).body)).toEqual(['Bob Brown']);
    expect(names((await list('risk=high')).body)).toEqual(['Carol Cruz']);
    expect(names((await list('joinedFrom=2026-02-20&joinedTo=2026-03-05')).body)).toEqual([
      'Bob Brown',
      'Carol Cruz',
    ]);
    expect(names((await list('joinedTo=2026-01-10')).body)).toEqual(['Alice Anders']);
    expect(names((await list('joinedFrom=2026-03-31')).body)).toEqual(['Dan Diaz']);
    expect(names((await list('joinedTo=9999-12-31')).body)).toEqual(ALL);
    expect(names((await list('joinedFrom=2026-03-31&joinedTo=9999-12-31')).body)).toEqual([
      'Dan Diaz',
    ]);
    expect(names((await list('joinedFrom=9999-12-31&joinedTo=9999-12-31')).body)).toEqual([]);
    expect((await list('status=bogus')).status).toBe(400);
    expect((await list('joinedFrom=yesterday')).status).toBe(400);
  });

  it('sorts by each key in both directions', async () => {
    expect(names((await list('sort=name&order=desc')).body)).toEqual([...ALL].reverse());
    expect(names((await list('sort=email')).body)).toEqual(ALL);
    expect(names((await list('sort=createdAt&order=desc')).body)).toEqual([...ALL].reverse());
    // Users who never signed in come last in either direction.
    expect(names((await list('sort=lastLoginAt')).body)).toEqual([
      'Carol Cruz',
      'Alice Anders',
      'Dan Diaz',
      'Bob Brown',
    ]);
    expect(names((await list('sort=lastLoginAt&order=desc')).body)).toEqual([
      'Dan Diaz',
      'Alice Anders',
      'Carol Cruz',
      'Bob Brown',
    ]);
    // Dan has no engagement row; the others sort by their engagement values.
    const scored = async (query: string) =>
      names((await list(query)).body).filter((n) => n !== 'Dan Diaz');
    expect(await scored('sort=engagementScore')).toEqual([
      'Carol Cruz',
      'Bob Brown',
      'Alice Anders',
    ]);
    expect(await scored('sort=engagementScore&order=desc')).toEqual([
      'Alice Anders',
      'Bob Brown',
      'Carol Cruz',
    ]);
    // at_risk < core_member < new_member
    expect(await scored('sort=membershipStage')).toEqual([
      'Carol Cruz',
      'Alice Anders',
      'Bob Brown',
    ]);
    expect(await scored('sort=membershipStage&order=desc')).toEqual([
      'Bob Brown',
      'Alice Anders',
      'Carol Cruz',
    ]);
  });

  describe('as a member', () => {
    it('sees active accounts only, with the directory projection', async () => {
      const res = await list('', memberToken);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 3, page: 1, pageSize: 25 });
      expect(names(res.body)).toEqual(['Alice Anders', 'Bob Brown', 'Dan Diaz']);
      for (const u of res.body.users) {
        expect(u.email).toBeUndefined();
        expect(u.engagement).toBeUndefined();
      }
    });

    it('ignores a blank q', async () => {
      const res = await list('q=', memberToken);
      expect(res.status).toBe(200);
      expect(names(res.body)).toEqual(['Alice Anders', 'Bob Brown', 'Dan Diaz']);
    });

    it('searches by name only', async () => {
      expect(names((await list('q=bob', memberToken)).body)).toEqual(['Bob Brown']);
      expect(names((await list('q=bob%40', memberToken)).body)).toEqual([]);
      expect(names((await list('q=choir', memberToken)).body)).toEqual([]);
      expect(names((await list('q=555', memberToken)).body)).toEqual([]);
      // Inactive accounts stay hidden even when the name matches.
      expect(names((await list('q=carol', memberToken)).body)).toEqual([]);
    });

    it('may sort by name and page', async () => {
      const res = await list('sort=name&order=desc&page=2&pageSize=2', memberToken);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(names(res.body)).toEqual(['Alice Anders']);
    });

    it.each([
      'status=active',
      'role=member',
      'stage=new_member',
      'risk=low',
      'joinedFrom=2026-01-01',
      'joinedTo=2026-12-31',
      'sort=email',
      'sort=engagementScore',
      'sort=lastLoginAt',
    ])('gets 403 for %s', async (query) => {
      const res = await list(query, memberToken);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/only staff/i);
    });
  });
});

describe('endOfDay', () => {
  it('is the last millisecond of the UTC day, also for 9999-12-31', () => {
    expect(endOfDay('2026-03-31').toISOString()).toBe('2026-03-31T23:59:59.999Z');
    expect(endOfDay('9999-12-31').toISOString()).toBe('9999-12-31T23:59:59.999Z');
  });
});
