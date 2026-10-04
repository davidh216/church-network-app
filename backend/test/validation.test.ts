import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, createUser, login, resetDatabase } from './helpers';

// Every mutating route rejects malformed input with 400 { error, code: "VALIDATION", details }.
// POST /api/analytics/members/engagement/refresh-all takes no input and is not listed.
let token: string;
let memberId: string;
const BAD_ID = 'not-a-cuid';

type Case = { method: 'post' | 'put' | 'delete'; path: () => string; body?: object; field: string };
const CASES: Case[] = [
  { method: 'post', path: () => '/api/auth/register', body: { email: 'nope', password: 'long-enough-pass1', name: 'X' }, field: 'email' },
  { method: 'post', path: () => '/api/auth/login', body: { email: 'nope', password: 'x' }, field: 'email' },
  { method: 'post', path: () => '/api/auth/change-password', body: { currentPassword: 'x', newPassword: 'short' }, field: 'newPassword' },
  { method: 'post', path: () => '/api/auth/change-password', body: { newPassword: 'long-enough-pass1' }, field: 'currentPassword' },
  { method: 'post', path: () => `/api/users/${memberId}/reset-password`, body: { newPassword: 'short' }, field: 'newPassword' },
  { method: 'post', path: () => `/api/users/${BAD_ID}/reset-password`, body: { newPassword: 'long-enough-pass1' }, field: 'id' },
  { method: 'post', path: () => '/api/users', body: { name: '', email: 'ok@validation.test.local', password: 'long-enough-pass1' }, field: 'name' },
  { method: 'post', path: () => '/api/users', body: { name: 'X', email: 'ok@validation.test.local', password: 'long-enough-pass1', roleIds: ['x'] }, field: 'roleIds' },
  { method: 'put', path: () => `/api/users/${memberId}`, body: { isActive: 'yes' }, field: 'isActive' },
  { method: 'put', path: () => `/api/users/${BAD_ID}`, body: { name: 'X' }, field: 'id' },
  { method: 'post', path: () => '/api/users/saved-searches', body: { name: '', query: {} }, field: 'name' },
  { method: 'post', path: () => '/api/users/saved-searches', body: { name: 'No query' }, field: 'query' },
  { method: 'delete', path: () => `/api/users/saved-searches/${BAD_ID}`, field: 'id' },
  { method: 'post', path: () => `/api/users/saved-searches/${BAD_ID}/use`, field: 'id' },
  { method: 'post', path: () => '/api/media', body: { title: 'T', type: 'VIDEO', url: 'https://youtu.be/abc' }, field: 'type' },
  { method: 'post', path: () => '/api/media', body: { title: 'T', type: 'YOUTUBE_VIDEO', url: 'http://youtu.be/abc' }, field: 'url' },
  { method: 'post', path: () => '/api/media', body: { title: 'T', type: 'YOUTUBE_VIDEO', url: 'https://example.com/watch?v=abc' }, field: 'url' },
  { method: 'post', path: () => '/api/media', body: { title: 'T', type: 'YOUTUBE_VIDEO', url: 'https://youtube.com/channel/x' }, field: 'url' },
  { method: 'post', path: () => `/api/analytics/members/${BAD_ID}/engagement/refresh`, field: 'id' },
  { method: 'post', path: () => `/api/analytics/members/${memberId}/activities`, body: { activityType: 'volunteer', points: 'many' }, field: 'points' },
  { method: 'post', path: () => `/api/analytics/members/${memberId}/interactions`, body: { interactionType: 'shout', channel: 'email' }, field: 'interactionType' },
  { method: 'post', path: () => `/api/analytics/members/${memberId}/interactions`, body: { interactionType: 'call_made', channel: 'pigeon' }, field: 'channel' },
  { method: 'post', path: () => `/api/member-details/${memberId}/interactions`, body: { interactionType: 'call_made', channel: 'phone', priority: 'whenever' }, field: 'priority' },
  { method: 'post', path: () => `/api/member-details/${memberId}/milestones`, body: { milestoneType: 'baptism', title: 'B', achievedDate: 'not a date' }, field: 'achievedDate' },
  { method: 'post', path: () => `/api/member-details/${memberId}/milestones`, body: { milestoneType: 'baptism', title: 'B', achievedDate: '2026-01-01', impact: 'huge' }, field: 'impact' },
  { method: 'post', path: () => `/api/member-details/${memberId}/notes`, body: { content: '' }, field: 'content' },
  { method: 'post', path: () => `/api/member-details/${memberId}/notes`, body: { content: 'ok', noteType: 'gossip' }, field: 'noteType' },
  { method: 'post', path: () => `/api/member-details/${BAD_ID}/notes`, body: { content: 'ok' }, field: 'id' },
];

describe('request validation', () => {
  beforeAll(async () => {
    await resetDatabase();
    await createUser({ email: 'validation-admin@validation.test.local', role: 'admin' });
    memberId = (await createUser({ email: 'validation-member@validation.test.local', role: 'member' })).id;
    token = await login('validation-admin@validation.test.local');
  });

  it.each(CASES)('$method ($field) -> 400 VALIDATION', async ({ method, path, body, field }) => {
    let req = request(app)[method](path()).set(bearer(token));
    if (body) req = req.send(body);
    const res = await req;
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(typeof res.body.error).toBe('string');
    expect(res.body.details[field]).toEqual(expect.arrayContaining([expect.any(String)]));
  });

  it('reports a missing body under details.body', async () => {
    const res = await request(app).post(`/api/member-details/${memberId}/notes`).set(bearer(token));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.details.body).toHaveLength(1);
  });

  it('bounds limit to 100 and coerces it from the query string', async () => {
    const tooMany = await request(app).get(`/api/member-details/${memberId}/timeline?limit=101`).set(bearer(token));
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.details.limit).toBeDefined();
    const negative = await request(app).get(`/api/member-details/${memberId}/notes?offset=-1`).set(bearer(token));
    expect(negative.status).toBe(400);
    expect(negative.body.details.offset).toBeDefined();
    const ok = await request(app).get(`/api/member-details/${memberId}/timeline?limit=100&offset=0`).set(bearer(token));
    expect(ok.status).toBe(200);
    expect((await request(app).get('/api/media?limit=500').set(bearer(token))).status).toBe(400);
  });

  it('rejects unknown enum values in list filters', async () => {
    const res = await request(app).get(`/api/member-details/${memberId}/interactions?category=gossip`).set(bearer(token));
    expect(res.status).toBe(400);
    expect(res.body.details.category).toBeDefined();
    expect((await request(app).get('/api/media?type=IMAGE').set(bearer(token))).status).toBe(400);
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Malformed JSON body');
  });
});
