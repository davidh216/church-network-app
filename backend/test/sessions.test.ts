import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, createUser, login, resetDatabase, sessionToken } from './helpers';
import { prisma } from '../src/lib/prisma';

const PASSWORD = 'correct-horse-battery';

function setCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith('embrace_session='));
  if (!cookie) throw new Error('no embrace_session cookie set');
  return cookie;
}

describe('cookie sessions', () => {
  let memberId: string;

  beforeAll(async () => {
    await resetDatabase();
    memberId = (await createUser({ email: 'cookie-member@sessions.test.local', role: 'member' }))
      .id;
  });

  it('login sets an HttpOnly, SameSite=Lax session cookie and returns no token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cookie-member@sessions.test.local', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.id).toBe(memberId);
    expect('token' in res.body).toBe(false);
    const cookie = setCookie(res);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Path=\//);
    // JWT_EXPIRES_IN is 1h in the test env.
    expect(cookie).toMatch(/; Max-Age=3600/);
    // Secure only in production.
    expect(cookie).not.toMatch(/; Secure/);
  });

  it('/me works with the cookie alone', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'cookie-member@sessions.test.local', password: PASSWORD })
      .expect(200);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('cookie-member@sessions.test.local');
    expect((await agent.get('/api/users')).status).toBe(200);
  });

  it('logout clears the cookie with 204, after which the agent is anonymous', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'cookie-member@sessions.test.local', password: PASSWORD })
      .expect(200);
    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(204);
    const cleared = setCookie(out);
    expect(cleared).toMatch(/^embrace_session=;/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('an invalid session cookie is rejected with 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'embrace_session=garbage');
    expect(res.status).toBe(401);
  });

  it('bearer tokens still work', async () => {
    const token = await login('cookie-member@sessions.test.local');
    const me = await request(app).get('/api/auth/me').set(bearer(token));
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(memberId);
  });
});

describe('email enumeration', () => {
  beforeAll(async () => {
    await resetDatabase();
    await createUser({ email: 'existing@sessions.test.local', role: 'member', name: 'Existing' });
  });

  it('register answers an existing email exactly like a new one and creates nothing', async () => {
    const fresh = await request(app)
      .post('/api/auth/register')
      .send({ email: 'brand-new@sessions.test.local', password: 'long-enough-pass1', name: 'New' });
    const dupe = await request(app).post('/api/auth/register').send({
      email: 'Existing@sessions.test.local',
      password: 'long-enough-pass1',
      name: 'Imposter',
    });
    expect(fresh.status).toBe(201);
    expect(dupe.status).toBe(201);
    expect(dupe.body).toEqual(fresh.body);
    expect(dupe.body.pendingApproval).toBe(true);
    expect(await prisma.user.count({ where: { email: 'existing@sessions.test.local' } })).toBe(1);
    const existing = await prisma.user.findUniqueOrThrow({
      where: { email: 'existing@sessions.test.local' },
    });
    expect(existing.name).toBe('Existing');
    expect(existing.isActive).toBe(true);
  });

  it('login gives the same error for an unknown email and a wrong password', async () => {
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: 'existing@sessions.test.local', password: 'not-the-password' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@sessions.test.local', password: 'not-the-password' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });
});

describe('password policy', () => {
  let adminToken: string;

  beforeAll(async () => {
    await resetDatabase();
    await createUser({ email: 'policy-admin@sessions.test.local', role: 'admin' });
    adminToken = await login('policy-admin@sessions.test.local');
  });

  const REJECTED: { reason: string; email: string; password: string }[] = [
    { reason: 'shorter than 12', email: 'p1@sessions.test.local', password: 'Short-pass1' },
    { reason: 'longer than 128', email: 'p2@sessions.test.local', password: 'x'.repeat(129) },
    {
      reason: 'the email local part',
      email: 'jonathan.doe-1@sessions.test.local',
      password: 'jonathan.doe-1',
    },
    {
      reason: 'the email local part, ignoring case',
      email: 'Jonathan.Doe-1@sessions.test.local',
      password: 'JONATHAN.DOE-1',
    },
    { reason: 'a common password', email: 'p3@sessions.test.local', password: '1qaz2wsx3edc' },
    {
      reason: 'a common password, ignoring case',
      email: 'p4@sessions.test.local',
      password: 'QWERTY123456',
    },
  ];

  it.each(REJECTED)('register rejects a password that is $reason', async ({ email, password }) => {
    const res = await request(app).post('/api/auth/register').send({ email, password, name: 'P' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.details.password).toEqual([expect.any(String)]);
    expect(await prisma.user.count({ where: { email: email.toLowerCase() } })).toBe(0);
  });

  it.each(REJECTED)(
    'staff create rejects a password that is $reason',
    async ({ email, password }) => {
      const res = await request(app)
        .post('/api/users')
        .set(bearer(adminToken))
        .send({ email, password, name: 'P' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
      expect(res.body.details.password).toEqual([expect.any(String)]);
    },
  );

  it('accepts a 12-character password that passes every rule', async () => {
    const res = await request(app)
      .post('/api/users')
      .set(bearer(adminToken))
      .send({ email: 'ok-12@sessions.test.local', password: 'tw3lve-chars', name: 'Ok' });
    expect(res.status).toBe(201);
  });
});

describe('change-password and reset-password', () => {
  let memberToken: string;
  let memberId: string;
  let leaderToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await resetDatabase();
    memberId = (await createUser({ email: 'changer@sessions.test.local', role: 'member' })).id;
    await createUser({ email: 'pw-leader@sessions.test.local', role: 'leader' });
    await createUser({ email: 'pw-admin@sessions.test.local', role: 'admin' });
    memberToken = await login('changer@sessions.test.local');
    leaderToken = await login('pw-leader@sessions.test.local');
    adminToken = await login('pw-admin@sessions.test.local');
  });

  it('rejects a wrong current password with 400 and keeps the old password', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set(bearer(memberToken))
      .send({ currentPassword: 'not-my-password', newPassword: 'a-brand-new-passphrase' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.details.currentPassword).toEqual(['Current password is incorrect']);
    await login('changer@sessions.test.local', PASSWORD);
  });

  it('applies the policy to the new password, including the account email', async () => {
    const common = await request(app)
      .post('/api/auth/change-password')
      .set(bearer(memberToken))
      .send({ currentPassword: PASSWORD, newPassword: 'qwertyqwerty' });
    expect(common.status).toBe(400);
    expect(common.body.details.newPassword).toEqual(['This password is too common']);

    await createUser({ email: 'long.local-part@sessions.test.local', role: 'member' });
    const token = await login('long.local-part@sessions.test.local');
    const ownEmail = await request(app)
      .post('/api/auth/change-password')
      .set(bearer(token))
      .send({ currentPassword: PASSWORD, newPassword: 'Long.Local-Part' });
    expect(ownEmail.status).toBe(400);
    expect(ownEmail.body.code).toBe('VALIDATION');
    expect(ownEmail.body.details.newPassword).toEqual([expect.stringMatching(/email/)]);
  });

  it('changes the password for the signed-in user (cookie session)', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'changer@sessions.test.local', password: PASSWORD })
      .expect(200);
    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: 'a-brand-new-passphrase' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'changer@sessions.test.local', password: PASSWORD })
      ).status,
    ).toBe(401);
    await login('changer@sessions.test.local', 'a-brand-new-passphrase');
  });

  it('reset-password is admin only', async () => {
    const body = { newPassword: 'reset-by-somebody-1' };
    expect(
      (await request(app).post(`/api/users/${memberId}/reset-password`).send(body)).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post(`/api/users/${memberId}/reset-password`)
          .set(bearer(memberToken))
          .send(body)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/users/${memberId}/reset-password`)
          .set(bearer(leaderToken))
          .send(body)
      ).status,
    ).toBe(403);
  });

  it('an admin resets a password; the policy applies and unknown ids are 404', async () => {
    const common = await request(app)
      .post(`/api/users/${memberId}/reset-password`)
      .set(bearer(adminToken))
      .send({ newPassword: '123456qwerty' });
    expect(common.status).toBe(400);
    expect(common.body.details.newPassword).toBeDefined();

    const target = await prisma.user.findUniqueOrThrow({
      where: { email: 'long.local-part@sessions.test.local' },
    });
    const ownEmail = await request(app)
      .post(`/api/users/${target.id}/reset-password`)
      .set(bearer(adminToken))
      .send({ newPassword: 'long.local-part' });
    expect(ownEmail.status).toBe(400);
    expect(ownEmail.body.details.newPassword).toBeDefined();

    const missing = await request(app)
      .post('/api/users/cjld2cjxh0000qzrmn831i7rn/reset-password')
      .set(bearer(adminToken))
      .send({ newPassword: 'reset-by-the-admin-1' });
    expect(missing.status).toBe(404);

    const res = await request(app)
      .post(`/api/users/${memberId}/reset-password`)
      .set(bearer(adminToken))
      .send({ newPassword: 'reset-by-the-admin-1' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const relogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'changer@sessions.test.local', password: 'reset-by-the-admin-1' });
    expect(relogin.status).toBe(200);
    expect(sessionToken(relogin)).toBeDefined();
  });
});
