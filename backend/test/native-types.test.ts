import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, createUser, login, resetDatabase } from './helpers';
import { prisma } from '../src/lib/prisma';

// PHASE3_SPECS.md 1.3: list and JSON columns are native types, and the API carries arrays and
// objects, never JSON strings.
const DOMAIN = '@native-types.test.local';
let admin: string;
let member: string;
let memberId: string;

beforeAll(async () => {
  await resetDatabase();
  await createUser({ email: `admin${DOMAIN}`, role: 'admin' });
  memberId = (await createUser({ email: `member${DOMAIN}`, role: 'member' })).id;
  admin = await login(`admin${DOMAIN}`);
  member = await login(`member${DOMAIN}`);
});

describe('media tags', () => {
  it('stores and returns tags as an array, filtering on a whole tag regardless of case', async () => {
    const created = await request(app)
      .post('/api/media')
      .set(bearer(admin))
      .send({
        title: 'Tagged',
        type: 'YOUTUBE_VIDEO',
        url: 'https://youtu.be/ccccccccccc',
        tags: ['Worship', 'Youth Night'],
      });
    expect(created.status).toBe(201);
    // Stored in the categories' format (PHASE3 fix F8): trimmed, lower-case, hyphenated.
    expect(created.body.media.tags).toEqual(['worship', 'youth-night']);
    const stored = await prisma.media.findUniqueOrThrow({ where: { id: created.body.media.id } });
    expect(stored.tags).toEqual(['worship', 'youth-night']);

    const titles = async (tag: string) => {
      const res = await request(app)
        .get(`/api/media?tag=${encodeURIComponent(tag)}`)
        .set(bearer(member));
      expect(res.status).toBe(200);
      return (res.body.media as { title: string; tags: unknown }[]).map((m) => {
        expect(Array.isArray(m.tags)).toBe(true);
        return m.title;
      });
    };
    expect(await titles('youth night')).toEqual(['Tagged']);
    expect(await titles('WORSHIP')).toEqual(['Tagged']);
    expect(await titles('YOUTH-NIGHT')).toEqual(['Tagged']);
    expect(await titles('Youth')).toEqual([]);
  });
});

describe('role permissions', () => {
  it('lists permissions as arrays', async () => {
    const res = await request(app).get('/api/roles').set(bearer(member));
    expect(res.status).toBe(200);
    for (const role of res.body.roles as { permissions: unknown }[])
      expect(Array.isArray(role.permissions)).toBe(true);
  });

  it('includes role permissions as arrays on the signed-in user', async () => {
    const res = await request(app).get('/api/auth/me').set(bearer(member));
    expect(res.status).toBe(200);
    expect(res.body.user.roles[0].role.permissions).toEqual([]);
  });
});

describe('profile skills and interests', () => {
  it('start empty and come back as arrays on member details', async () => {
    const res = await request(app).get(`/api/member-details/${memberId}`).set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ volunteerSkills: [], interests: [] });
  });

  it('a member replaces their own lists; entries are trimmed and de-duplicated', async () => {
    const res = await request(app)
      .put(`/api/users/${memberId}`)
      .set(bearer(member))
      .send({ volunteerSkills: [' Music ', 'music', 'Teaching'], interests: ['Hiking'] });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      volunteerSkills: ['Music', 'Teaching'],
      interests: ['Hiking'],
    });
    const details = await request(app).get(`/api/member-details/${memberId}`).set(bearer(admin));
    expect(details.body.user).toMatchObject({
      volunteerSkills: ['Music', 'Teaching'],
      interests: ['Hiking'],
    });
  });

  it.each([
    ['a JSON string', { interests: '["Hiking"]' }, 'interests'],
    ['a blank entry', { volunteerSkills: ['  '] }, 'volunteerSkills'],
    ['too many entries', { interests: Array.from({ length: 31 }, (_, i) => `i${i}`) }, 'interests'],
  ])('rejects %s with 400 VALIDATION', async (_label, body, key) => {
    const res = await request(app).put(`/api/users/${memberId}`).set(bearer(member)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(Object.keys(res.body.details)).toContain(key);
  });

  it('CSV export is unaffected by the list columns', async () => {
    const res = await request(app)
      .get(`/api/users/export?format=csv&members=${memberId}`)
      .set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.text.split('\n')[0]).toContain('Name');
    expect(res.text).toContain(`member${DOMAIN}`);
  });
});

describe('activity and interaction metadata', () => {
  it('stores metadata as JSON objects', async () => {
    const activity = await request(app)
      .post(`/api/analytics/members/${memberId}/activities`)
      .set(bearer(admin))
      .send({ activityType: 'volunteer', points: 1, metadata: { hours: 4, role: 'usher' } });
    expect(activity.status).toBeLessThan(300);
    const interaction = await request(app)
      .post(`/api/analytics/members/${memberId}/interactions`)
      .set(bearer(admin))
      .send({ interactionType: 'call_made', channel: 'phone', metadata: { minutes: 12 } });
    expect(interaction.status).toBeLessThan(300);
    const noMetadata = await request(app)
      .post(`/api/analytics/members/${memberId}/activities`)
      .set(bearer(admin))
      .send({ activityType: 'other', points: 0 });
    expect(noMetadata.status).toBeLessThan(300);

    const activities = await prisma.memberActivity.findMany({
      where: { userId: memberId },
      orderBy: { activityType: 'asc' },
    });
    expect(activities.map((a) => [a.activityType, a.metadata])).toEqual([
      ['volunteer', { hours: 4, role: 'usher' }],
      ['other', null],
    ]);
    const [stored] = await prisma.memberInteraction.findMany({
      where: { userId: memberId, interactionType: 'call_made' },
    });
    expect(stored?.metadata).toEqual({ minutes: 12 });
  });
});

describe('saved search queries', () => {
  it('stores the query as a JSON object', async () => {
    const query = {
      conditions: [{ field: 'name', operator: 'contains', value: 'a' }],
      logic: 'AND',
    };
    const res = await request(app)
      .post('/api/users/saved-searches')
      .set(bearer(admin))
      .send({ name: 'Native', query });
    expect(res.status).toBe(201);
    const stored = await prisma.savedSearch.findUniqueOrThrow({
      where: { id: res.body.search.id },
    });
    expect(stored.query).toMatchObject(query);
    expect(typeof stored.query).toBe('object');
  });
});

// Postgres cannot store U+0000 in text, text[] or jsonb, and Prisma cannot write deeply nested
// JSON, so the shared schemas reject both and the API answers 400 VALIDATION, never 500.
describe('input the database cannot store', () => {
  const NUL = '\u0000';
  const expectValidation = (res: request.Response) => {
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  };

  it('a member gets 400 for U+0000 in a saved-search value or a profile list entry', async () => {
    const query = {
      conditions: [{ field: 'name', operator: 'contains', value: `a${NUL}` }],
      logic: 'AND',
    };
    expectValidation(
      await request(app)
        .post('/api/users/saved-searches')
        .set(bearer(member))
        .send({ name: 'Bad', query }),
    );
    for (const body of [{ interests: [`x${NUL}`] }, { volunteerSkills: [`x${NUL}`] }])
      expectValidation(
        await request(app).put(`/api/users/${memberId}`).set(bearer(member)).send(body),
      );
    expectValidation(
      await request(app).put(`/api/users/${memberId}`).set(bearer(member)).send({ bio: NUL }),
    );
  });

  it('staff get 400 for U+0000 in media tags', async () => {
    expectValidation(
      await request(app)
        .post('/api/media')
        .set(bearer(admin))
        .send({
          title: 'Bad tags',
          type: 'YOUTUBE_VIDEO',
          url: 'https://youtu.be/ddddddddddd',
          tags: [`a${NUL}b`],
        }),
    );
  });

  it('staff get 400 for U+0000 in metadata keys or values and for deep metadata', async () => {
    let deep: unknown = 1;
    for (let i = 0; i < 200; i += 1) deep = { d: deep };
    for (const metadata of [{ a: NUL }, { [`k${NUL}`]: 1 }, deep]) {
      expectValidation(
        await request(app)
          .post(`/api/analytics/members/${memberId}/activities`)
          .set(bearer(admin))
          .send({ activityType: 'other', metadata }),
      );
      expectValidation(
        await request(app)
          .post(`/api/analytics/members/${memberId}/interactions`)
          .set(bearer(admin))
          .send({ interactionType: 'call_made', channel: 'phone', metadata }),
      );
    }
    // About 60 KB of nested arrays, sent as raw JSON (the test client would overflow serialising
    // it): within the body limit and far beyond any sane depth.
    const veryDeep = `{"activityType":"other","metadata":{"d":${'['.repeat(30_000)}${']'.repeat(30_000)}}}`;
    expectValidation(
      await request(app)
        .post(`/api/analytics/members/${memberId}/activities`)
        .set(bearer(admin))
        .set('Content-Type', 'application/json')
        .send(veryDeep),
    );
  });
});
