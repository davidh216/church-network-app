import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { audit } from '../src/lib/audit';
import { app, bearer, createUser, login, resetDatabase } from './helpers';

// Wrap the real helper so a test can make one audit write fail.
vi.mock('../src/lib/audit', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/audit')>();
  return { ...real, audit: vi.fn(real.audit) };
});

let admin: { Authorization: string };
let leader: { Authorization: string };
let adminId: string;
let leaderId: string;
let memberId: string;
let roleIds: Record<'admin' | 'leader' | 'member', string>;

const events = () => prisma.auditEvent.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

describe('audit log (G1)', () => {
  beforeAll(async () => {
    await resetDatabase();
    adminId = (await createUser({ email: 'audit-admin@audit.test.local', role: 'admin' })).id;
    leaderId = (
      await createUser({ email: 'audit-leader@audit.test.local', role: 'leader', name: 'Lena' })
    ).id;
    memberId = (
      await createUser({ email: 'audit-member@audit.test.local', role: 'member', name: 'Mo' })
    ).id;
    admin = bearer(await login('audit-admin@audit.test.local'));
    leader = bearer(await login('audit-leader@audit.test.local'));
    const roles = await prisma.role.findMany();
    roleIds = Object.fromEntries(roles.map((r) => [r.name, r.id])) as typeof roleIds;
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.user.update({ where: { id: memberId }, data: { isActive: true } });
  });

  afterAll(resetDatabase);

  it('records a role change with the old and new role names', async () => {
    const res = await request(app)
      .put(`/api/users/${memberId}`)
      .set(admin)
      .send({ roleIds: [roleIds.leader, roleIds.member] });
    expect(res.status).toBe(200);
    const [event, ...rest] = await events();
    expect(rest).toEqual([]);
    expect(event).toMatchObject({
      actorId: adminId,
      action: 'user_role_changed',
      targetType: 'user',
      targetId: memberId,
      metadata: { from: ['member'], to: ['leader', 'member'] },
    });
    // Sending the same roles again changes nothing and records nothing.
    await request(app)
      .put(`/api/users/${memberId}`)
      .set(admin)
      .send({ roleIds: [roleIds.member, roleIds.leader] });
    expect(await events()).toHaveLength(1);
    await request(app)
      .put(`/api/users/${memberId}`)
      .set(admin)
      .send({ roleIds: [roleIds.member] });
  });

  it('records deactivation and activation, and nothing for an unchanged status', async () => {
    await request(app).put(`/api/users/${memberId}`).set(leader).send({ isActive: false });
    await request(app).put(`/api/users/${memberId}`).set(leader).send({ isActive: false });
    await request(app).put(`/api/users/${memberId}`).set(leader).send({ isActive: true });
    await request(app).put(`/api/users/${memberId}`).set(leader).send({ bio: 'No audit' });
    expect((await events()).map((e) => [e.action, e.actorId, e.targetId])).toEqual([
      ['user_deactivated', leaderId, memberId],
      ['user_activated', leaderId, memberId],
    ]);
  });

  it('records an admin password reset without any password data', async () => {
    const res = await request(app)
      .post(`/api/users/${memberId}/reset-password`)
      .set(admin)
      .send({ newPassword: 'a-brand-new-passphrase' });
    expect(res.status).toBe(200);
    const [event] = await events();
    expect(event).toMatchObject({
      action: 'user_password_reset_by_admin',
      actorId: adminId,
      targetId: memberId,
      metadata: null,
    });
  });

  it('records the roles and the inactive status of an account staff create, nothing for a default one', async () => {
    const create = (email: string, extra: object) =>
      request(app)
        .post('/api/users')
        .set(admin)
        .send({ name: email, email, password: 'a-long-enough-passphrase', ...extra });
    const plain = await create('plain@audit.test.local', {});
    expect(plain.status).toBe(201);
    expect(await events()).toEqual([]);

    const staff = await create('staff@audit.test.local', {
      roleIds: [roleIds.member, roleIds.leader],
      isActive: false,
    });
    expect(staff.status).toBe(201);
    const staffId = staff.body.user.id;
    expect((await events()).map((e) => [e.action, e.actorId, e.targetId, e.metadata])).toEqual([
      ['user_role_changed', adminId, staffId, { from: [], to: ['leader', 'member'] }],
      ['user_deactivated', adminId, staffId, null],
    ]);
    await prisma.auditEvent.deleteMany();
    const inactive = await create('inactive@audit.test.local', { isActive: false });
    expect((await events()).map((e) => [e.action, e.targetId])).toEqual([
      ['user_deactivated', inactive.body.user.id],
    ]);
    await prisma.user.deleteMany({
      where: {
        email: { endsWith: '@audit.test.local' },
        id: { notIn: [adminId, leaderId, memberId] },
      },
    });
  });

  it('creates no account when the audit write fails', async () => {
    vi.mocked(audit).mockRejectedValueOnce(new Error('audit write failed'));
    const res = await request(app).post('/api/users').set(admin).send({
      name: 'Rolled back',
      email: 'rolled-back@audit.test.local',
      password: 'a-long-enough-passphrase',
      isActive: false,
    });
    expect(res.status).toBe(500);
    expect(await prisma.user.findUnique({ where: { email: 'rolled-back@audit.test.local' } })).toBe(
      null,
    );
  });

  it('records concurrent updates of one account as a chain of the values each one replaced', async () => {
    const put = (roles: string[], isActive: boolean) =>
      request(app).put(`/api/users/${memberId}`).set(admin).send({ roleIds: roles, isActive });
    const results = await Promise.all([
      put([roleIds.leader], false),
      put([roleIds.member, roleIds.leader], false),
      put([roleIds.leader], false),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const all = await events();
    // One deactivation, however the three interleave.
    expect(all.filter((e) => e.action === 'user_deactivated')).toHaveLength(1);
    // Each role event starts where the previous one ended, and the last one ends at the stored roles.
    const changes = all
      .filter((e) => e.action === 'user_role_changed')
      .map((e) => e.metadata as { from: string[]; to: string[] });
    expect(changes[0]!.from).toEqual(['member']);
    for (let i = 1; i < changes.length; i++) expect(changes[i]!.from).toEqual(changes[i - 1]!.to);
    const stored = await prisma.userRole.findMany({
      where: { userId: memberId },
      select: { role: { select: { name: true } } },
    });
    expect(changes.at(-1)!.to).toEqual(stored.map((r) => r.role.name).sort());
    await request(app)
      .put(`/api/users/${memberId}`)
      .set(admin)
      .send({ roleIds: [roleIds.member] });
  });

  it('rolls the change back when the audit write fails, and the event with a failed change', async () => {
    vi.mocked(audit).mockRejectedValueOnce(new Error('audit write failed'));
    const res = await request(app).put(`/api/users/${memberId}`).set(leader).send({
      isActive: false,
    });
    expect(res.status).toBe(500);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: memberId } })).isActive).toBe(true);
    expect(await events()).toEqual([]);

    await expect(
      prisma.$transaction(async (tx) => {
        await audit(tx, { id: adminId }, 'tag_created', { type: 'tag', id: null });
        throw new Error('the change failed');
      }),
    ).rejects.toThrow('the change failed');
    expect(await events()).toEqual([]);
  });

  describe('GET /api/audit', () => {
    beforeEach(async () => {
      const at = (iso: string) => new Date(iso);
      await prisma.auditEvent.createMany({
        data: [
          {
            actorId: adminId,
            action: 'user_role_changed',
            targetType: 'user',
            targetId: memberId,
            createdAt: at('2026-03-01T10:00:00Z'),
          },
          {
            actorId: leaderId,
            action: 'tag_created',
            targetType: 'tag',
            targetId: 'ck0000000000000000000tag1',
            metadata: { name: 'Choir' },
            createdAt: at('2026-03-02T23:59:59Z'),
          },
          {
            actorId: leaderId,
            action: 'user_deactivated',
            targetType: 'user',
            targetId: memberId,
            createdAt: at('2026-03-03T00:00:00Z'),
          },
          {
            actorId: null,
            action: 'tag_deleted',
            targetType: 'tag',
            targetId: 'ck0000000000000000000tag1',
            count: 4,
            metadata: { name: 'Choir' },
            createdAt: at('2026-03-04T08:00:00Z'),
          },
        ],
      });
    });

    const list = (query: string) => request(app).get(`/api/audit${query}`).set(admin);

    it('lists events newest first with the actor and target names', async () => {
      const res = await list('');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 4, page: 1, pageSize: 50 });
      expect(res.body.events.map((e: { action: string }) => e.action)).toEqual([
        'tag_deleted',
        'user_deactivated',
        'tag_created',
        'user_role_changed',
      ]);
      expect(res.body.events[0]).toMatchObject({
        actor: null,
        targetName: 'Choir',
        count: 4,
        metadata: { name: 'Choir' },
      });
      expect(res.body.events[1]).toMatchObject({
        actor: { id: leaderId, name: 'Lena' },
        targetType: 'user',
        targetId: memberId,
        targetName: 'Mo',
      });
    });

    it('filters by actor, action, target and an inclusive date range, and pages', async () => {
      const actions = async (query: string) =>
        (await list(query)).body.events.map((e: { action: string }) => e.action);
      expect(await actions(`?actorId=${leaderId}`)).toEqual(['user_deactivated', 'tag_created']);
      expect(await actions('?action=tag_created')).toEqual(['tag_created']);
      expect(await actions(`?targetType=user&targetId=${memberId}`)).toEqual([
        'user_deactivated',
        'user_role_changed',
      ]);
      expect(await actions('?targetType=tag')).toEqual(['tag_deleted', 'tag_created']);
      expect(await actions('?from=2026-03-02&to=2026-03-03')).toEqual([
        'user_deactivated',
        'tag_created',
      ]);
      const page2 = await list('?pageSize=3&page=2');
      expect(page2.body).toMatchObject({ total: 4, page: 2, pageSize: 3 });
      expect(page2.body.events.map((e: { action: string }) => e.action)).toEqual([
        'user_role_changed',
      ]);
    });

    it('rejects bad filters with 400', async () => {
      for (const query of [
        '?action=user.role_changed',
        `?targetId=${memberId}`,
        '?from=2026-03-05&to=2026-03-01',
        '?actorId=not-an-id',
        '?targetType=planet',
      ])
        expect((await list(query)).status, query).toBe(400);
    });

    it('is refused to leaders', async () => {
      expect((await request(app).get('/api/audit').set(leader)).status).toBe(403);
    });
  });
});
