import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, createUser, login, resetDatabase } from './helpers';

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
        url: 'https://youtu.be/abc123',
        tags: ['Worship'],
      });
    expect(created.status).toBe(201);
    await request(app)
      .post('/api/media')
      .set(bearer(token))
      .send({ title: 'Youth night', type: 'YOUTUBE_VIDEO', url: 'https://youtu.be/def456', tags: ['youth'] });
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

  it('filters by tag regardless of case', async () => {
    expect(await titles('tag=worship')).toEqual(['Sunday Worship Service']);
    expect(await titles('tag=YOUTH')).toEqual(['Youth night']);
  });

  it('returns everything without filters', async () => {
    expect(await titles('')).toEqual(['Sunday Worship Service', 'Youth night']);
  });
});
