import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, createUser, login, resetDatabase } from './helpers';
import { prisma } from '../src/lib/prisma';

// Postgres `contains` is case-sensitive by default; search and tag filters must use mode: 'insensitive'.
describe('media search (postgres, case-insensitive)', () => {
  let token: string;

  beforeAll(async () => {
    await resetDatabase();
    await createUser({ email: 'media-admin@media-search.test.local', role: 'admin' });
    token = await login('media-admin@media-search.test.local');
    const created = await request(app)
      .post('/api/media')
      .set(bearer(token))
      .send({
        title: 'Sunday Worship Service',
        description: 'Morning GATHERING',
        type: 'YOUTUBE_VIDEO',
        url: 'https://youtu.be/abc123def45',
        tags: ['Worship'],
      });
    expect(created.status).toBe(201);
    await request(app)
      .post('/api/media')
      .set(bearer(token))
      .send({
        title: 'Youth night',
        type: 'YOUTUBE_VIDEO',
        url: 'https://youtu.be/def456ghi78',
        tags: ['youth'],
      });
  });

  const titles = async (query: string) => {
    const res = await request(app).get(`/api/media?${query}`).set(bearer(token));
    expect(res.status).toBe(200);
    return (res.body.media as { title: string }[]).map((m) => m.title).sort();
  };

  it('matches the title regardless of case', async () => {
    expect(await titles('search=sunday%20WORSHIP')).toEqual(['Sunday Worship Service']);
  });

  it('matches the description regardless of case', async () => {
    expect(await titles('search=gathering')).toEqual(['Sunday Worship Service']);
  });

  it('matches any tag regardless of case, literally', async () => {
    const created = await request(app)
      .post('/api/media')
      .set(bearer(token))
      .send({
        title: 'Holiday special',
        type: 'YOUTUBE_VIDEO',
        url: 'https://youtu.be/ghi789jkl01',
        tags: ['Easter 2026', 'Special event'],
      });
    expect(created.status).toBe(201);
    expect(created.body.media.tags).toEqual(['easter-2026', 'special-event']);
    expect(await titles('search=EASTER')).toEqual(['Holiday special']);
    expect(await titles('search=special%20event')).toEqual(['Holiday special']);
    expect(await titles('search=l-ev')).toEqual(['Holiday special']);
    expect(await titles('search=youth')).toEqual(['Youth night']);
    expect(await titles('search=%25')).toEqual([]);
    expect(await titles('tag=special-event')).toEqual(['Holiday special']);
    expect(await titles('tag=Special%20Event')).toEqual(['Holiday special']);
    // The stored tag form is compared with the query in that form, whatever its spelling.
    expect(await titles('tag=%20SPECIAL%20%20-%20event%20')).toEqual(['Holiday special']);
    expect(await titles('tag=special')).toEqual([]);
    await prisma.media.delete({ where: { id: created.body.media.id } });
  });

  it('filters by tag regardless of case', async () => {
    expect(await titles('tag=worship')).toEqual(['Sunday Worship Service']);
    expect(await titles('tag=YOUTH')).toEqual(['Youth night']);
  });

  it('still finds a legacy tag stored outside the tag form, ignoring case', async () => {
    const legacy = await prisma.media.create({
      data: {
        title: 'Legacy tagged',
        type: 'YOUTUBE_VIDEO',
        url: 'https://youtu.be/legacy00001',
        tags: ['ΣΑΣ Night'],
        isPublic: true,
        isApproved: true,
      },
    });
    try {
      expect(await titles('tag=%CE%A3%CE%91%CE%A3%20night')).toEqual(['Legacy tagged']);
    } finally {
      await prisma.media.delete({ where: { id: legacy.id } });
    }
  });

  it('returns everything without filters', async () => {
    expect(await titles('')).toEqual(['Sunday Worship Service', 'Youth night']);
  });

  it('ignores a blank search or tag', async () => {
    for (const query of ['search=', 'tag=', 'search=%20&tag=%20%20'])
      expect(await titles(query), query).toEqual(['Sunday Worship Service', 'Youth night']);
  });

  it('rejects a page beyond 100000 with 400', async () => {
    const res = await request(app).get('/api/media?page=100001').set(bearer(token));
    expect(res.status).toBe(400);
  });
});
