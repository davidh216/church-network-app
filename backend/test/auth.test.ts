import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, createUser, login, resetDatabase } from './helpers';
import { prisma } from '../src/lib/prisma';

describe('authentication', () => {
  beforeAll(async () => {
    await resetDatabase();
    await createUser({ email: 'admin@test.local', role: 'admin' });
  });

  it('health reports OK with a reachable database', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });

  it('self-registration creates an inactive account and returns no token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'New.Person@test.local', password: 'longenough1', name: 'New Person' });
    expect(res.status).toBe(201);
    expect(res.body.pendingApproval).toBe(true);
    expect(res.body.token).toBeUndefined();
    expect(res.body.user.password).toBeUndefined();

    const stored = await prisma.user.findUnique({ where: { email: 'new.person@test.local' }, include: { roles: { include: { role: true } } } });
    expect(stored?.isActive).toBe(false);
    expect(stored?.roles.map((r) => r.role.name)).toEqual(['member']);
  });

  it('rejects malformed registration bodies', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'not-an-email', password: 'short', name: '' });
    expect(res.status).toBe(400);
    expect(res.body.details).toBeDefined();
  });

  it('inactive accounts cannot log in', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'new.person@test.local', password: 'longenough1' });
    expect(res.status).toBe(401);
  });

  it('wrong password is rejected with the same message as unknown user', async () => {
    const bad = await request(app).post('/api/auth/login').send({ email: 'admin@test.local', password: 'nope-nope-nope' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@test.local', password: 'nope-nope-nope' });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error).toBe(unknown.body.error);
  });

  it('active user logs in, receives a token, and /me never exposes the password hash', async () => {
    const token = await login('admin@test.local');
    const me = await request(app).get('/api/auth/me').set(bearer(token));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('admin@test.local');
    expect(me.body.user.password).toBeUndefined();
    expect(me.body.user.roles[0].role.name).toBe('admin');
    const stored = await prisma.user.findUnique({ where: { email: 'admin@test.local' } });
    expect(stored?.lastLoginAt).toBeInstanceOf(Date);
  });

  it('protected routes reject missing and invalid tokens with 401', async () => {
    expect((await request(app).get('/api/users')).status).toBe(401);
    expect((await request(app).get('/api/users').set(bearer('garbage'))).status).toBe(401);
    expect((await request(app).get('/api/member-details/x')).status).toBe(401);
  });

  it('unknown routes return a JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});
