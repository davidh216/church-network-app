import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, createUser, login, resetDatabase } from './helpers';
import { prisma } from '../src/lib/prisma';

// Item S3: media paging and strict YouTube URLs; saved searches hold exactly a searchQuery.
describe('media and saved searches (S3)', () => {
  let staff: string;
  let member: string;
  let staffId: string;
  let memberId: string;

  beforeAll(async () => {
    await resetDatabase();
    staffId = (await createUser({ email: 's3-leader@s3.test.local', role: 'leader' })).id;
    memberId = (await createUser({ email: 's3-member@s3.test.local', role: 'member' })).id;
    staff = await login('s3-leader@s3.test.local');
    member = await login('s3-member@s3.test.local');
  });

  const createMedia = (url: string, title = 'Video') =>
    request(app).post('/api/media').set(bearer(staff)).send({ title, type: 'YOUTUBE_VIDEO', url });

  describe('creating media', () => {
    it.each([
      ['https://youtu.be/dQw4w9WgXcQ?si=share'],
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'],
      ['https://m.youtube.com/watch?v=dQw4w9WgXcQ'],
    ])('stores %s as the canonical watch URL and returns videoId', async (url) => {
      const res = await createMedia(url);
      expect(res.status).toBe(201);
      expect(res.body.media.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(res.body.media.videoId).toBe('dQw4w9WgXcQ');
      const row = await prisma.media.findUniqueOrThrow({ where: { id: res.body.media.id } });
      expect(row.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it.each([
      ['https://vimeo.com/123456789'],
      ['https://example.com/watch?v=dQw4w9WgXcQ'],
      ['https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'],
      ['https://youtu.be/abc123'],
      ['https://youtu.be/dQw4w9WgXcQQ'],
      ['https://www.youtube.com/watch?v=dQw4w9WgX%3C'],
      ['https://www.youtube.com/embed/dQw4w9WgXcQ'],
      ['https://www.youtube.com/watch'],
      ['http://youtu.be/dQw4w9WgXcQ'],
      ['not a url'],
    ])('rejects %s with 400 VALIDATION on url', async (url) => {
      const res = await createMedia(url);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
      expect(res.body.details).toHaveProperty('url');
    });
  });

  describe('reading media', () => {
    let legacyId: string;

    beforeAll(async () => {
      await prisma.media.deleteMany();
      // 30 approved videos with distinct, increasing creation times; the list is newest first.
      for (let i = 0; i < 30; i++) {
        const id = `v${String(i).padStart(10, '0')}`;
        await prisma.media.create({
          data: {
            title: `Video ${String(i).padStart(2, '0')}`,
            type: 'YOUTUBE_VIDEO',
            url: `https://www.youtube.com/watch?v=${id}`,
            tags: '[]',
            uploadedById: staffId,
            isApproved: true,
            isPublic: true,
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
          },
        });
      }
      // A row stored before strict validation: kept as is, videoId derived as null.
      legacyId = (
        await prisma.media.create({
          data: {
            title: 'Legacy',
            type: 'YOUTUBE_VIDEO',
            url: 'https://youtu.be/abc123',
            tags: '[]',
            uploadedById: staffId,
            isApproved: true,
            isPublic: true,
            createdAt: new Date(Date.UTC(2025, 0, 1)),
          },
        })
      ).id;
      // Hidden rows count toward neither the page nor the total.
      await prisma.media.create({
        data: {
          title: 'Unapproved',
          type: 'YOUTUBE_VIDEO',
          url: 'https://youtu.be/dQw4w9WgXcQ',
          tags: '[]',
          uploadedById: staffId,
          isApproved: false,
        },
      });
    });

    const list = (query = '') => request(app).get(`/api/media?${query}`).set(bearer(member));

    it('defaults to page 1 of 24 and reports the total', async () => {
      const res = await list();
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, total: 31, page: 1, pageSize: 24 });
      expect(res.body.media).toHaveLength(24);
      expect(res.body.media[0]).toMatchObject({ title: 'Video 29', videoId: 'v0000000029' });
    });

    it('pages through every row once, newest first', async () => {
      const first = await list('page=1&pageSize=10');
      const last = await list('page=4&pageSize=10');
      expect(first.body.media.map((m: { title: string }) => m.title)[0]).toBe('Video 29');
      expect(last.body).toMatchObject({ total: 31, page: 4, pageSize: 10 });
      expect(last.body.media.map((m: { title: string }) => m.title)).toEqual(['Legacy']);
      const beyond = await list('page=5&pageSize=10');
      expect(beyond.body.media).toEqual([]);
      expect(beyond.body.total).toBe(31);

      const seen = new Set<string>();
      for (let page = 1; page <= 4; page++)
        for (const m of (await list(`page=${page}&pageSize=10`)).body.media as { id: string }[])
          seen.add(m.id);
      expect(seen.size).toBe(31);
    });

    it('allows up to 100 per page, no longer capped at 20', async () => {
      const res = await list('pageSize=100');
      expect(res.body.media).toHaveLength(31);
    });

    it.each([['pageSize=101'], ['pageSize=0'], ['page=0'], ['page=abc']])(
      'rejects %s with 400',
      async (query) => {
        const res = await list(query);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION');
      },
    );

    it('counts the filtered total', async () => {
      const res = await list('search=video%202&pageSize=5');
      expect(res.body.total).toBe(10); // Video 20 to Video 29
      expect(res.body.media).toHaveLength(5);
    });

    it('derives a null videoId for a legacy row that does not parse', async () => {
      const res = await request(app).get(`/api/media/${legacyId}`).set(bearer(member));
      expect(res.status).toBe(200);
      expect(res.body.media).toMatchObject({ url: 'https://youtu.be/abc123', videoId: null });
    });
  });

  describe('saved searches', () => {
    const query = {
      conditions: [
        { field: 'engagement.membershipStage', operator: 'equals', value: 'new_member' },
        { field: 'engagement.engagementScore', operator: 'gte', value: 50 },
      ],
      logic: 'AND',
    };
    const save = (body: object, token = member) =>
      request(app).post('/api/users/saved-searches').set(bearer(token)).send(body);

    it('saves and lists a valid searchQuery', async () => {
      const created = await save({ name: 'Engaged newcomers', query });
      expect(created.status).toBe(201);
      expect(created.body.search).toMatchObject({ query, invalid: false });
      const stored = await prisma.savedSearch.findUniqueOrThrow({
        where: { id: created.body.search.id },
      });
      expect(JSON.parse(stored.query)).toEqual(query);
      const listed = await request(app).get('/api/users/saved-searches').set(bearer(member));
      expect(listed.body.searches).toContainEqual(
        expect.objectContaining({ id: created.body.search.id, query, invalid: false }),
      );
    });

    it.each([
      ['an empty object', {}],
      ['no conditions', { conditions: [], logic: 'AND' }],
      [
        'an unknown field',
        { conditions: [{ field: 'password', operator: 'equals', value: 'x' }], logic: 'AND' },
      ],
      [
        'a bad operator',
        { conditions: [{ field: 'name', operator: 'gt', value: 'x' }], logic: 'AND' },
      ],
      ['a bad logic', { conditions: [{ field: 'name', operator: 'isEmpty' }], logic: 'XOR' }],
      ['a string', 'name contains smith'],
    ])('rejects %s with 400 VALIDATION', async (_label, bad) => {
      const res = await save({ name: 'Bad', query: bad });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
      expect(Object.keys(res.body.details).some((k) => k.startsWith('query'))).toBe(true);
    });

    it('returns stale rows with invalid: true, and /use still counts them', async () => {
      const stale = await prisma.savedSearch.create({
        data: {
          name: 'Old format',
          query: JSON.stringify({ conditions: [{ field: 'age', operator: 'gt', value: 30 }] }),
          createdBy: memberId,
        },
      });
      const broken = await prisma.savedSearch.create({
        data: { name: 'Not JSON', query: '{not json', createdBy: memberId },
      });
      const listed = await request(app).get('/api/users/saved-searches').set(bearer(member));
      const byId = new Map(
        (listed.body.searches as { id: string }[]).map((s) => [s.id, s] as const),
      );
      expect(byId.get(stale.id)).toMatchObject({
        invalid: true,
        query: { conditions: [{ field: 'age', operator: 'gt', value: 30 }] },
      });
      expect(byId.get(broken.id)).toMatchObject({ invalid: true, query: null });

      const used = await request(app)
        .post(`/api/users/saved-searches/${stale.id}/use`)
        .set(bearer(member));
      expect(used.status).toBe(200);
      expect(
        (await prisma.savedSearch.findUniqueOrThrow({ where: { id: stale.id } })).usageCount,
      ).toBe(1);
    });
  });
});
