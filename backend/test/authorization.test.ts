import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, createUser, login, resetDatabase } from './helpers';
import { prisma } from '../src/lib/prisma';

let adminToken: string;
let leaderToken: string;
let memberToken: string;
let adminId: string;
let leaderId: string;
let memberId: string;
let otherMemberId: string;

async function roleId(token: string, name: string): Promise<string> {
  const roles = (await request(app).get('/api/roles').set(bearer(token))).body.roles as { id: string; name: string }[];
  return roles.find((r) => r.name === name)!.id;
}

describe('authorization', () => {
  beforeAll(async () => {
    await resetDatabase();
    const admin = await createUser({ email: 'admin@test.local', role: 'admin' });
    const leader = await createUser({ email: 'leader@test.local', role: 'leader' });
    const member = await createUser({ email: 'member@test.local', role: 'member' });
    const other = await createUser({ email: 'other@test.local', role: 'member', name: 'Other Person' });
    adminId = admin.id;
    leaderId = leader.id;
    memberId = member.id;
    otherMemberId = other.id;
    await prisma.memberNote.createMany({
      data: [
        { userId: other.id, authorId: admin.id, content: 'Public pastoral note', isPrivate: false },
        { userId: other.id, authorId: admin.id, content: 'ADMIN PRIVATE prayer request', isPrivate: true },
        { userId: other.id, authorId: leader.id, content: 'LEADER PRIVATE follow-up', isPrivate: true },
      ],
    });
    adminToken = await login('admin@test.local');
    leaderToken = await login('leader@test.local');
    memberToken = await login('member@test.local');
  });

  describe('a plain member', () => {
    it('cannot read CRM profiles, notes, analytics or exports', async () => {
      expect((await request(app).get(`/api/member-details/${otherMemberId}`).set(bearer(memberToken))).status).toBe(403);
      expect((await request(app).get(`/api/member-details/${otherMemberId}/notes`).set(bearer(memberToken))).status).toBe(403);
      expect((await request(app).get('/api/analytics/members').set(bearer(memberToken))).status).toBe(403);
      expect((await request(app).get('/api/users/export').set(bearer(memberToken))).status).toBe(403);
    });

    it('cannot write notes, milestones, interactions, activities or media', async () => {
      expect((await request(app).post(`/api/member-details/${otherMemberId}/notes`).set(bearer(memberToken)).send({ content: 'x' })).status).toBe(403);
      expect((await request(app).post(`/api/member-details/${otherMemberId}/milestones`).set(bearer(memberToken)).send({ title: 'x' })).status).toBe(403);
      expect((await request(app).post(`/api/analytics/members/${otherMemberId}/activities`).set(bearer(memberToken)).send({ points: 1000 })).status).toBe(403);
      expect((await request(app).post('/api/analytics/members/engagement/refresh-all').set(bearer(memberToken))).status).toBe(403);
      expect((await request(app).post('/api/media').set(bearer(memberToken)).send({ title: 't', type: 'YOUTUBE_VIDEO', url: 'https://youtu.be/abc' })).status).toBe(403);
    });

    it('cannot create users or change roles/status', async () => {
      expect((await request(app).post('/api/users').set(bearer(memberToken)).send({ name: 'x', email: 'x@test.local', password: 'longenough1' })).status).toBe(403);
      expect((await request(app).put(`/api/users/${otherMemberId}`).set(bearer(memberToken)).send({ name: 'Hacked' })).status).toBe(403);
      expect((await request(app).put(`/api/users/${memberId}`).set(bearer(memberToken)).send({ isActive: false })).status).toBe(403);
      const leaderRoleId = await roleId(memberToken, 'leader');
      expect((await request(app).put(`/api/users/${memberId}`).set(bearer(memberToken)).send({ roleIds: [leaderRoleId] })).status).toBe(403);
      // Input is validated before authorization: a malformed role id is a 400, not a 403.
      expect((await request(app).put(`/api/users/${memberId}`).set(bearer(memberToken)).send({ roleIds: ['x'] })).status).toBe(400);
    });

    it('sees only a reduced directory without emails, phones or engagement', async () => {
      const res = await request(app).get('/api/users').set(bearer(memberToken));
      expect(res.status).toBe(200);
      expect(res.body.users.length).toBe(4);
      for (const u of res.body.users) {
        expect(u.email).toBeUndefined();
        expect(u.phone).toBeUndefined();
        expect(u.engagement).toBeUndefined();
        expect(u.password).toBeUndefined();
        expect(u.name).toBeDefined();
      }
      const other = await request(app).get(`/api/users/${otherMemberId}`).set(bearer(memberToken));
      expect(other.status).toBe(200);
      expect(other.body.user.email).toBeUndefined();
    });

    it('can read and edit their own profile', async () => {
      const self = await request(app).get(`/api/users/${memberId}`).set(bearer(memberToken));
      expect(self.body.user.email).toBe('member@test.local');
      const upd = await request(app).put(`/api/users/${memberId}`).set(bearer(memberToken)).send({ name: 'Renamed Member', phone: null });
      expect(upd.status).toBe(200);
      expect(upd.body.user.name).toBe('Renamed Member');
      expect(upd.body.user.phone).toBeNull();
    });

    it('stores a whitespace-only phone or bio as null', async () => {
      await prisma.user.update({ where: { id: memberId }, data: { phone: '555-0100', bio: 'Old bio' } });
      const upd = await request(app).put(`/api/users/${memberId}`).set(bearer(memberToken)).send({ phone: '   ', bio: ' \t ' });
      expect(upd.status).toBe(200);
      expect(upd.body.user.phone).toBeNull();
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
      expect(stored.phone).toBeNull();
      expect(stored.bio).toBeNull();
    });

    it('gets 400 for a user id that is not a cuid', async () => {
      const res = await request(app).get('/api/users/not-a-cuid').set(bearer(memberToken));
      expect(res.status).toBe(400);
      expect(res.body.details.id).toBeDefined();
    });
  });

  describe('a leader', () => {
    it('reads full profiles without the password hash and without other people\'s private notes', async () => {
      const res = await request(app).get(`/api/member-details/${otherMemberId}`).set(bearer(leaderToken));
      expect(res.status).toBe(200);
      expect(res.body.user.password).toBeUndefined();
      const contents = res.body.user.memberNotes.map((n: { content: string }) => n.content);
      expect(contents).toContain('Public pastoral note');
      expect(contents).toContain('LEADER PRIVATE follow-up');
      expect(contents).not.toContain('ADMIN PRIVATE prayer request');
      const notes = await request(app).get(`/api/member-details/${otherMemberId}/notes`).set(bearer(leaderToken));
      expect(notes.body.notes.map((n: { content: string }) => n.content)).not.toContain('ADMIN PRIVATE prayer request');
    });

    it('gets the staff member list with contact and engagement fields', async () => {
      const res = await request(app).get('/api/users').set(bearer(leaderToken));
      expect(res.status).toBe(200);
      const u = res.body.users.find((x: { id: string }) => x.id === otherMemberId);
      expect(u.email).toBe('other@test.local');
      expect('engagement' in u).toBe(true);
      expect(u.password).toBeUndefined();
    });

    it('can export CSV, with cells escaped', async () => {
      await prisma.user.update({ where: { id: otherMemberId }, data: { bio: '=HYPERLINK("x"), "quoted"' } });
      const res = await request(app).get('/api/users/export?format=csv').set(bearer(leaderToken)).set('Origin', 'http://localhost:3000');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toBe('attachment; filename="members.csv"');
      expect(res.headers['access-control-expose-headers']).toContain('Content-Disposition');
      expect(res.text).toContain('"\'=HYPERLINK(""x""), ""quoted"""');
    });

    it('gets the full CSV header even when no member matches the export', async () => {
      const res = await request(app).get('/api/users/export?format=csv&members=cnonexistent0000000000000').set(bearer(leaderToken));
      expect(res.status).toBe(200);
      const lines = res.text.split('\n');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^"Name","Email","Phone","Bio","Status","Roles",/);
      expect(lines[0]).toMatch(/"Last Login"$/);
      expect(lines[0]!.split(',')).toHaveLength(18);
    });

    it('can create members but cannot grant the admin or leader role', async () => {
      for (const name of ['admin', 'leader']) {
        const denied = await request(app)
          .post('/api/users')
          .set(bearer(leaderToken))
          .send({ name: 'Sneaky', email: `sneaky-${name}@test.local`, password: 'longenough1', roleIds: [await roleId(leaderToken, name)] });
        expect(denied.status).toBe(403);
        expect(denied.body.error).toBe('Only an admin can grant staff roles');
      }
      expect(await prisma.user.count({ where: { email: { startsWith: 'sneaky' } } })).toBe(0);
      const ok = await request(app).post('/api/users').set(bearer(leaderToken)).send({ name: 'Created By Leader', email: 'Created@test.local', password: 'longenough1' });
      expect(ok.status).toBe(201);
      expect(ok.body.user.email).toBe('created@test.local');
      expect(ok.body.user.isActive).toBe(true);
      expect(ok.body.user.roles.map((r: { role: { name: string } }) => r.role.name)).toEqual(['member']);
    });

    it('can approve a pending registration', async () => {
      await request(app).post('/api/auth/register').send({ email: 'pending@test.local', password: 'longenough1', name: 'Pending' });
      const pending = await prisma.user.findUniqueOrThrow({ where: { email: 'pending@test.local' } });
      expect((await request(app).post('/api/auth/login').send({ email: 'pending@test.local', password: 'longenough1' })).status).toBe(401);
      const approve = await request(app).put(`/api/users/${pending.id}`).set(bearer(leaderToken)).send({ isActive: true });
      expect(approve.status).toBe(200);
      expect((await request(app).post('/api/auth/login').send({ email: 'pending@test.local', password: 'longenough1' })).status).toBe(200);
    });

    it('cannot change roles, even to member', async () => {
      const res = await request(app).put(`/api/users/${memberId}`).set(bearer(leaderToken)).send({ roleIds: [await roleId(leaderToken, 'member')] });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Only an admin can change roles');
    });

    it('cannot deactivate the admin', async () => {
      const res = await request(app).put(`/api/users/${adminId}`).set(bearer(leaderToken)).send({ isActive: false });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Only an admin can modify staff accounts');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).isActive).toBe(true);
      expect(await login('admin@test.local')).toBeTruthy();
    });

    it('cannot edit another leader', async () => {
      const otherLeader = await createUser({ email: 'leader2@test.local', role: 'leader', name: 'Second Leader' });
      const res = await request(app).put(`/api/users/${otherLeader.id}`).set(bearer(leaderToken)).send({ name: 'x' });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Only an admin can modify staff accounts');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: otherLeader.id } })).name).toBe('Second Leader');
    });

    it('can still edit a plain member and their own profile', async () => {
      const member = await request(app).put(`/api/users/${memberId}`).set(bearer(leaderToken)).send({ name: 'Edited By Leader' });
      expect(member.status).toBe(200);
      expect(member.body.user.name).toBe('Edited By Leader');
      const self = await request(app).put(`/api/users/${leaderId}`).set(bearer(leaderToken)).send({ name: 'Leader Renamed' });
      expect(self.status).toBe(200);
      expect(self.body.user.name).toBe('Leader Renamed');
    });
  });

  describe('an admin', () => {
    it('sees private notes from every author', async () => {
      const res = await request(app).get(`/api/member-details/${otherMemberId}/notes`).set(bearer(adminToken));
      expect(res.body.notes.map((n: { content: string }) => n.content).sort()).toEqual(['ADMIN PRIVATE prayer request', 'LEADER PRIVATE follow-up', 'Public pastoral note']);
    });

    it('can change roles', async () => {
      const roles = (await request(app).get('/api/roles').set(bearer(adminToken))).body.roles as { id: string; name: string }[];
      const leaderRole = roles.find((r) => r.name === 'leader')!;
      const res = await request(app).put(`/api/users/${otherMemberId}`).set(bearer(adminToken)).send({ roleIds: [leaderRole.id] });
      expect(res.status).toBe(200);
      expect(res.body.user.roles.map((r: { role: { name: string } }) => r.role.name)).toEqual(['leader']);
    });

    it('can modify a leader account', async () => {
      const res = await request(app).put(`/api/users/${leaderId}`).set(bearer(adminToken)).send({ name: 'Leader By Admin' });
      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Leader By Admin');
    });

    it('cannot deactivate themself', async () => {
      const res = await request(app).put(`/api/users/${adminId}`).set(bearer(adminToken)).send({ isActive: false });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You cannot lock yourself out');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).isActive).toBe(true);
    });

    it('cannot drop their own admin role', async () => {
      const res = await request(app).put(`/api/users/${adminId}`).set(bearer(adminToken)).send({ roleIds: [await roleId(adminToken, 'member')] });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You cannot lock yourself out');
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: adminId }, include: { roles: { include: { role: true } } } });
      expect(stored.roles.map((r) => r.role.name)).toEqual(['admin']);
    });
  });
});
