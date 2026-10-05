import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, createUser, login, resetDatabase, sessionToken } from './helpers';
import { prisma } from '../src/lib/prisma';

// Every route mounted behind `authenticate` in app.ts; none may answer an anonymous caller.
const SOME_ID = 'cjld2cjxh0000qzrmn831i7rn';
const GATED_ROUTES: { method: 'get' | 'post'; path: string }[] = [
  { method: 'get', path: '/api/users' },
  { method: 'post', path: '/api/users' },
  { method: 'get', path: '/api/users/export' },
  { method: 'get', path: '/api/users/saved-searches' },
  { method: 'get', path: '/api/roles' },
  { method: 'get', path: '/api/media' },
  { method: 'post', path: '/api/media' },
  { method: 'get', path: '/api/analytics/members' },
  { method: 'get', path: `/api/member-details/${SOME_ID}` },
  { method: 'post', path: `/api/member-details/${SOME_ID}/notes` },
  { method: 'post', path: '/api/auth/change-password' },
  { method: 'post', path: `/api/users/${SOME_ID}/reset-password` },
];

describe('authentication', () => {
  beforeAll(async () => {
    await resetDatabase();
    await createUser({ email: 'admin@auth.test.local', role: 'admin' });
  });

  it('health reports OK with a reachable database', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });

  it('self-registration creates an inactive account and returns no token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'New.Person@auth.test.local',
      password: 'long-enough-pass1',
      name: 'New Person',
    });
    expect(res.status).toBe(201);
    expect(res.body.pendingApproval).toBe(true);
    expect(res.body.token).toBeUndefined();
    expect(res.body.user).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();

    const stored = await prisma.user.findUnique({
      where: { email: 'new.person@auth.test.local' },
      include: { roles: { include: { role: true } } },
    });
    expect(stored?.isActive).toBe(false);
    expect(stored?.roles.map((r) => r.role.name)).toEqual(['member']);
  });

  it('rejects malformed registration bodies', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short', name: '' });
    expect(res.status).toBe(400);
    expect(res.body.details).toBeDefined();
  });

  it('inactive accounts cannot log in', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'new.person@auth.test.local', password: 'long-enough-pass1' });
    expect(res.status).toBe(401);
  });

  it('wrong password is rejected with the same message as unknown user', async () => {
    const bad = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@auth.test.local', password: 'nope-nope-nope' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@auth.test.local', password: 'nope-nope-nope' });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error).toBe(unknown.body.error);
  });

  it('active user logs in, receives a token, and /me never exposes the password hash', async () => {
    const token = await login('admin@auth.test.local');
    const me = await request(app).get('/api/auth/me').set(bearer(token));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('admin@auth.test.local');
    expect(me.body.user.password).toBeUndefined();
    expect(me.body.user.roles[0].role.name).toBe('admin');
    const stored = await prisma.user.findUnique({ where: { email: 'admin@auth.test.local' } });
    expect(stored?.lastLoginAt).toBeInstanceOf(Date);
  });

  it('login and /me return only the self projection: no password hash, no staff notes', async () => {
    await prisma.user.update({
      where: { email: 'admin@auth.test.local' },
      data: { notes: 'STAFF-ONLY pastoral note' },
    });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@auth.test.local', password: 'correct-horse-battery' });
    expect(loginRes.status).toBe(200);
    expect('password' in loginRes.body.user).toBe(false);
    expect('notes' in loginRes.body.user).toBe(false);
    const me = await request(app)
      .get('/api/auth/me')
      .set(bearer(sessionToken(loginRes)!));
    expect(me.status).toBe(200);
    expect('password' in me.body.user).toBe(false);
    expect('notes' in me.body.user).toBe(false);
    expect(JSON.stringify(me.body)).not.toContain('STAFF-ONLY');
    expect(me.body.user).toMatchObject({
      email: 'admin@auth.test.local',
      name: 'admin',
      isActive: true,
    });
    expect(typeof me.body.user.id).toBe('string');
    expect(me.body.user.roles[0].role.name).toBe('admin');
  });

  it('rejects an oversized JSON body with 413', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@auth.test.local', password: 'x'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
    expect(typeof res.body.error).toBe('string');
  });

  it('protected routes reject missing and invalid tokens with 401', async () => {
    expect((await request(app).get('/api/users')).status).toBe(401);
    expect((await request(app).get('/api/users').set(bearer('garbage'))).status).toBe(401);
    expect((await request(app).get('/api/member-details/x')).status).toBe(401);
  });

  it.each(GATED_ROUTES)('$method $path without a token -> 401', async ({ method, path }) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });

  it('unknown routes return a JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});
