import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, createUser, login, resetDatabase } from './helpers';
import { prisma } from '../src/lib/prisma';

let adminToken: string;
let leaderToken: string;
let memberToken: string;
let memberId: string;
let otherMemberId: string;

describe('authorization', () => {
  beforeAll(async () => {
    await resetDatabase();
    const admin = await createUser({ email: 'admin@test.local', role: 'admin' });
    const leader = await createUser({ email: 'leader@test.local', role: 'leader' });
    const member = await createUser({ email: 'member@test.local', role: 'member' });
    const other = await createUser({ email: 'other@test.local', role: 'member', name: 'Other Person' });
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
      expect((await request(app).put(`/api/users/${memberId}`).set(bearer(memberToken)).send({ roleIds: ['x'] })).status).toBe(403);
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
      const res = await request(app).get('/api/users/export?format=csv').set(bearer(leaderToken));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('"\'=HYPERLINK(""x""), ""quoted"""');
    });

    it('can create members but cannot grant the admin role', async () => {
      const roles = (await request(app).get('/api/roles').set(bearer(leaderToken))).body.roles as { id: string; name: string }[];
      const adminRole = roles.find((r) => r.name === 'admin')!;
      const denied = await request(app).post('/api/users').set(bearer(leaderToken)).send({ name: 'Sneaky', email: 'sneaky@test.local', password: 'longenough1', roleIds: [adminRole.id] });
      expect(denied.status).toBe(403);
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
  });
});
