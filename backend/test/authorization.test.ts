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
  const roles = (await request(app).get('/api/roles').set(bearer(token))).body.roles as {
    id: string;
    name: string;
  }[];
  return roles.find((r) => r.name === name)!.id;
}

describe('authorization', () => {
  beforeAll(async () => {
    await resetDatabase();
    const admin = await createUser({ email: 'admin@authorization.test.local', role: 'admin' });
    const leader = await createUser({ email: 'leader@authorization.test.local', role: 'leader' });
    const member = await createUser({ email: 'member@authorization.test.local', role: 'member' });
    const other = await createUser({
      email: 'other@authorization.test.local',
      role: 'member',
      name: 'Other Person',
    });
    adminId = admin.id;
    leaderId = leader.id;
    memberId = member.id;
    otherMemberId = other.id;
    await prisma.memberNote.createMany({
      data: [
        { userId: other.id, authorId: admin.id, content: 'Public pastoral note', isPrivate: false },
        {
          userId: other.id,
          authorId: admin.id,
          content: 'ADMIN PRIVATE prayer request',
          isPrivate: true,
        },
        {
          userId: other.id,
          authorId: leader.id,
          content: 'LEADER PRIVATE follow-up',
          isPrivate: true,
        },
      ],
    });
    adminToken = await login('admin@authorization.test.local');
    leaderToken = await login('leader@authorization.test.local');
    memberToken = await login('member@authorization.test.local');
  });

  describe('a plain member', () => {
    it('cannot read CRM profiles, notes, analytics or exports', async () => {
      expect(
        (await request(app).get(`/api/member-details/${otherMemberId}`).set(bearer(memberToken)))
          .status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .get(`/api/member-details/${otherMemberId}/notes`)
            .set(bearer(memberToken))
        ).status,
      ).toBe(403);
      expect(
        (await request(app).get('/api/analytics/members').set(bearer(memberToken))).status,
      ).toBe(403);
      expect((await request(app).get('/api/users/export').set(bearer(memberToken))).status).toBe(
        403,
      );
    });

    it('cannot write notes, milestones, interactions, activities or media', async () => {
      expect(
        (
          await request(app)
            .post(`/api/member-details/${otherMemberId}/notes`)
            .set(bearer(memberToken))
            .send({ content: 'x' })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post(`/api/member-details/${otherMemberId}/milestones`)
            .set(bearer(memberToken))
            .send({ title: 'x' })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post(`/api/analytics/members/${otherMemberId}/activities`)
            .set(bearer(memberToken))
            .send({ points: 1000 })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post('/api/analytics/members/engagement/refresh-all')
            .set(bearer(memberToken))
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post('/api/media')
            .set(bearer(memberToken))
            .send({ title: 't', type: 'YOUTUBE_VIDEO', url: 'https://youtu.be/abc' })
        ).status,
      ).toBe(403);
    });

    it('cannot create users or change roles/status', async () => {
      expect(
        (
          await request(app)
            .post('/api/users')
            .set(bearer(memberToken))
            .send({ name: 'x', email: 'x@authorization.test.local', password: 'long-enough-pass1' })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .put(`/api/users/${otherMemberId}`)
            .set(bearer(memberToken))
            .send({ name: 'Hacked' })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .put(`/api/users/${memberId}`)
            .set(bearer(memberToken))
            .send({ isActive: false })
        ).status,
      ).toBe(403);
      const leaderRoleId = await roleId(memberToken, 'leader');
      expect(
        (
          await request(app)
            .put(`/api/users/${memberId}`)
            .set(bearer(memberToken))
            .send({ roleIds: [leaderRoleId] })
        ).status,
      ).toBe(403);
      // Input is validated before authorization: a malformed role id is a 400, not a 403.
      expect(
        (
          await request(app)
            .put(`/api/users/${memberId}`)
            .set(bearer(memberToken))
            .send({ roleIds: ['x'] })
        ).status,
      ).toBe(400);
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
      expect(self.body.user.email).toBe('member@authorization.test.local');
      const upd = await request(app)
        .put(`/api/users/${memberId}`)
        .set(bearer(memberToken))
        .send({ name: 'Renamed Member', phone: null });
      expect(upd.status).toBe(200);
      expect(upd.body.user.name).toBe('Renamed Member');
      expect(upd.body.user.phone).toBeNull();
    });

    it('never sees their own engagement, stage or risk; staff do', async () => {
      await prisma.memberEngagement.upsert({
        where: { userId: memberId },
        create: { userId: memberId, membershipStage: 'at_risk', riskLevel: 'high' },
        update: { membershipStage: 'at_risk', riskLevel: 'high' },
      });
      const crmKeys = ['engagement', 'membershipStage', 'riskLevel', 'notes', 'password'];
      const self = await request(app).get(`/api/users/${memberId}`).set(bearer(memberToken));
      expect(self.status).toBe(200);
      const upd = await request(app)
        .put(`/api/users/${memberId}`)
        .set(bearer(memberToken))
        .send({ interests: ['music'] });
      expect(upd.status).toBe(200);
      expect(upd.body.user.interests).toEqual(['music']);
      const me = await request(app).get('/api/auth/me').set(bearer(memberToken));
      for (const body of [self.body.user, upd.body.user]) {
        for (const key of crmKeys) expect(body).not.toHaveProperty(key);
        expect(Object.keys(body).sort()).toEqual(Object.keys(me.body.user).sort());
      }
      expect(JSON.stringify([self.body, upd.body])).not.toMatch(/at_risk|"high"/);

      const asLeader = await request(app).get(`/api/users/${memberId}`).set(bearer(leaderToken));
      expect(asLeader.body.user.engagement).toMatchObject({
        membershipStage: 'at_risk',
        riskLevel: 'high',
      });
      const leaderSelf = await request(app)
        .put(`/api/users/${leaderId}`)
        .set(bearer(leaderToken))
        .send({ interests: ['music'] });
      expect(leaderSelf.status).toBe(200);
      expect(leaderSelf.body.user).toHaveProperty('engagement');
      const leaderOwn = await request(app).get(`/api/users/${leaderId}`).set(bearer(leaderToken));
      expect(leaderOwn.body.user).toHaveProperty('engagement');
    });

    it('stores a whitespace-only phone or bio as null', async () => {
      await prisma.user.update({
        where: { id: memberId },
        data: { phone: '555-0100', bio: 'Old bio' },
      });
      const upd = await request(app)
        .put(`/api/users/${memberId}`)
        .set(bearer(memberToken))
        .send({ phone: '   ', bio: ' \t ' });
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
    it("reads full profiles without the password hash and without other people's private notes", async () => {
      const res = await request(app)
        .get(`/api/member-details/${otherMemberId}`)
        .set(bearer(leaderToken));
      expect(res.status).toBe(200);
      expect(res.body.user.password).toBeUndefined();
      const contents = res.body.user.memberNotes.map((n: { content: string }) => n.content);
      expect(contents).toContain('Public pastoral note');
      expect(contents).toContain('LEADER PRIVATE follow-up');
      expect(contents).not.toContain('ADMIN PRIVATE prayer request');
      const notes = await request(app)
        .get(`/api/member-details/${otherMemberId}/notes`)
        .set(bearer(leaderToken));
      expect(notes.body.notes.map((n: { content: string }) => n.content)).not.toContain(
        'ADMIN PRIVATE prayer request',
      );
    });

    it('gets the staff member list with contact and engagement fields', async () => {
      const res = await request(app).get('/api/users').set(bearer(leaderToken));
      expect(res.status).toBe(200);
      const u = res.body.users.find((x: { id: string }) => x.id === otherMemberId);
      expect(u.email).toBe('other@authorization.test.local');
      expect('engagement' in u).toBe(true);
      expect(u.password).toBeUndefined();
    });

    it('can export CSV, with cells escaped', async () => {
      await prisma.user.update({
        where: { id: otherMemberId },
        data: { bio: '=HYPERLINK("x"), "quoted"' },
      });
      const res = await request(app)
        .get('/api/users/export?format=csv')
        .set(bearer(leaderToken))
        .set('Origin', 'http://localhost:3000');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toBe('attachment; filename="members.csv"');
      expect(res.headers['access-control-expose-headers']).toContain('Content-Disposition');
      expect(res.text).toContain('"\'=HYPERLINK(""x""), ""quoted"""');
    });

    it('gets the full CSV header even when no member matches the export', async () => {
      const res = await request(app)
        .get('/api/users/export?format=csv&members=cnonexistent0000000000000')
        .set(bearer(leaderToken));
      expect(res.status).toBe(200);
      const lines = res.text.split('\n');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^"Name","Email","Phone","Bio","Status","Roles",/);
      expect(lines[0]).toMatch(/"Last Login"$/);
      expect(lines[0]!.split(',')).toHaveLength(16);
    });

    it('can create members but cannot grant the admin or leader role', async () => {
      for (const name of ['admin', 'leader']) {
        const denied = await request(app)
          .post('/api/users')
          .set(bearer(leaderToken))
          .send({
            name: 'Sneaky',
            email: `sneaky-${name}@authorization.test.local`,
            password: 'long-enough-pass1',
            roleIds: [await roleId(leaderToken, name)],
          });
        expect(denied.status).toBe(403);
        expect(denied.body.error).toBe('Only an admin can grant staff roles');
      }
      expect(await prisma.user.count({ where: { email: { startsWith: 'sneaky' } } })).toBe(0);
      const ok = await request(app).post('/api/users').set(bearer(leaderToken)).send({
        name: 'Created By Leader',
        email: 'Created@authorization.test.local',
        password: 'long-enough-pass1',
      });
      expect(ok.status).toBe(201);
      expect(ok.body.user.email).toBe('created@authorization.test.local');
      expect(ok.body.user.isActive).toBe(true);
      expect(ok.body.user.roles.map((r: { role: { name: string } }) => r.role.name)).toEqual([
        'member',
      ]);
    });

    it('can approve a pending registration', async () => {
      await request(app).post('/api/auth/register').send({
        email: 'pending@authorization.test.local',
        password: 'long-enough-pass1',
        name: 'Pending',
      });
      const pending = await prisma.user.findUniqueOrThrow({
        where: { email: 'pending@authorization.test.local' },
      });
      expect(
        (
          await request(app)
            .post('/api/auth/login')
            .send({ email: 'pending@authorization.test.local', password: 'long-enough-pass1' })
        ).status,
      ).toBe(401);
      const approve = await request(app)
        .put(`/api/users/${pending.id}`)
        .set(bearer(leaderToken))
        .send({ isActive: true });
      expect(approve.status).toBe(200);
      expect(
        (
          await request(app)
            .post('/api/auth/login')
            .send({ email: 'pending@authorization.test.local', password: 'long-enough-pass1' })
        ).status,
      ).toBe(200);
    });

    it('cannot change roles, even to member', async () => {
      const res = await request(app)
        .put(`/api/users/${memberId}`)
        .set(bearer(leaderToken))
        .send({ roleIds: [await roleId(leaderToken, 'member')] });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Only an admin can change roles');
    });

    it('cannot deactivate the admin', async () => {
      const res = await request(app)
        .put(`/api/users/${adminId}`)
        .set(bearer(leaderToken))
        .send({ isActive: false });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Only an admin can modify staff accounts');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).isActive).toBe(true);
      expect(await login('admin@authorization.test.local')).toBeTruthy();
    });

    it('cannot edit another leader', async () => {
      const otherLeader = await createUser({
        email: 'leader2@authorization.test.local',
        role: 'leader',
        name: 'Second Leader',
      });
      const res = await request(app)
        .put(`/api/users/${otherLeader.id}`)
        .set(bearer(leaderToken))
        .send({ name: 'x' });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Only an admin can modify staff accounts');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: otherLeader.id } })).name).toBe(
        'Second Leader',
      );
    });

    it('can still edit a plain member and their own profile', async () => {
      const member = await request(app)
        .put(`/api/users/${memberId}`)
        .set(bearer(leaderToken))
        .send({ name: 'Edited By Leader' });
      expect(member.status).toBe(200);
      expect(member.body.user.name).toBe('Edited By Leader');
      const self = await request(app)
        .put(`/api/users/${leaderId}`)
        .set(bearer(leaderToken))
        .send({ name: 'Leader Renamed' });
      expect(self.status).toBe(200);
      expect(self.body.user.name).toBe('Leader Renamed');
    });
  });

  describe('an admin', () => {
    it('sees private notes from every author', async () => {
      const res = await request(app)
        .get(`/api/member-details/${otherMemberId}/notes`)
        .set(bearer(adminToken));
      expect(res.body.notes.map((n: { content: string }) => n.content).sort()).toEqual([
        'ADMIN PRIVATE prayer request',
        'LEADER PRIVATE follow-up',
        'Public pastoral note',
      ]);
    });

    it('can change roles', async () => {
      const roles = (await request(app).get('/api/roles').set(bearer(adminToken))).body.roles as {
        id: string;
        name: string;
      }[];
      const leaderRole = roles.find((r) => r.name === 'leader')!;
      const res = await request(app)
        .put(`/api/users/${otherMemberId}`)
        .set(bearer(adminToken))
        .send({ roleIds: [leaderRole.id] });
      expect(res.status).toBe(200);
      expect(res.body.user.roles.map((r: { role: { name: string } }) => r.role.name)).toEqual([
        'leader',
      ]);
    });

    it('can modify a leader account', async () => {
      const res = await request(app)
        .put(`/api/users/${leaderId}`)
        .set(bearer(adminToken))
        .send({ name: 'Leader By Admin' });
      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Leader By Admin');
    });

    it('cannot deactivate themself', async () => {
      const res = await request(app)
        .put(`/api/users/${adminId}`)
        .set(bearer(adminToken))
        .send({ isActive: false });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You cannot lock yourself out');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).isActive).toBe(true);
    });

    it('cannot drop their own admin role', async () => {
      const res = await request(app)
        .put(`/api/users/${adminId}`)
        .set(bearer(adminToken))
        .send({ roleIds: [await roleId(adminToken, 'member')] });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You cannot lock yourself out');
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: adminId },
        include: { roles: { include: { role: true } } },
      });
      expect(stored.roles.map((r) => r.role.name)).toEqual(['admin']);
    });
  });

  // PHASE5_SPECS.md 1.2: members see active groups with public fields and leader names only.
  describe('groups (G3)', () => {
    let activeId: string;
    let archivedId: string;
    const asMember = () => bearer(memberToken);

    beforeAll(async () => {
      activeId = (
        await prisma.group.create({
          data: {
            name: 'Authz Choir',
            type: 'ministry',
            members: {
              create: [
                { userId: leaderId, role: 'leader' },
                { userId: otherMemberId, role: 'member' },
                { userId: memberId, role: 'member' },
              ],
            },
          },
        })
      ).id;
      archivedId = (
        await prisma.group.create({
          data: {
            name: 'Authz Archived',
            type: 'committee',
            isActive: false,
            members: { create: [{ userId: memberId, role: 'leader' }] },
          },
        })
      ).id;
    });

    it('a member never receives rosters, member counts or archived groups', async () => {
      const list = await request(app).get('/api/groups').set(asMember());
      const one = await request(app).get(`/api/groups/${activeId}`).set(asMember());
      const mine = await request(app).get('/api/groups?mine=true').set(asMember());
      for (const res of [list, one, mine]) {
        expect(res.status).toBe(200);
        // The plain member on the roster is never named; neither is the archived group.
        expect(res.text).not.toContain('Other Person');
        expect(res.text).not.toContain(otherMemberId);
        expect(res.text).not.toContain('Authz Archived');
        expect(res.text).not.toMatch(/memberCount|roster|isActive|userId/);
      }
      const { name } = await prisma.user.findUniqueOrThrow({ where: { id: leaderId } });
      expect(one.body.group.leaders).toEqual([{ name, role: 'leader' }]);
      expect(mine.body.memberships.map((m: { role: string }) => m.role)).toEqual(['member']);
    });

    it('a member asking for an archived group gets 404, not 403', async () => {
      const res = await request(app).get(`/api/groups/${archivedId}`).set(asMember());
      expect(res.status).toBe(404);
      expect((await request(app).get('/api/groups?status=inactive').set(asMember())).status).toBe(
        403,
      );
    });

    it('a member cannot create, edit, archive or delete groups, or change rosters', async () => {
      const tries = [
        request(app).post('/api/groups').send({ name: 'Mine', type: 'ministry' }),
        request(app).patch(`/api/groups/${activeId}`).send({ isActive: false }),
        request(app).delete(`/api/groups/${activeId}`),
        request(app).post(`/api/groups/${activeId}/members`).send({ userId: memberId }),
        request(app).patch(`/api/groups/${activeId}/members/${memberId}`).send({ role: 'leader' }),
        request(app).delete(`/api/groups/${activeId}/members/${otherMemberId}`),
      ];
      for (const attempt of tries) expect((await attempt.set(asMember())).status).toBe(403);
      const group = await prisma.group.findUniqueOrThrow({
        where: { id: activeId },
        include: { members: { orderBy: { userId: 'asc' } } },
      });
      expect(group.isActive).toBe(true);
      expect(group.members).toHaveLength(3);
      expect(group.members.find((m) => m.userId === memberId)?.role).toBe('member');
      expect(await prisma.group.count({ where: { name: 'Mine' } })).toBe(0);
    });

    it('a leader sees the roster and counts but cannot delete a group', async () => {
      const res = await request(app).get(`/api/groups/${activeId}`).set(bearer(leaderToken));
      expect(res.body.group.memberCount).toBe(3);
      expect(res.body.group.roster.map((r: { name: string }) => r.name)).toContain('Other Person');
      const del = await request(app).delete(`/api/groups/${activeId}`).set(bearer(leaderToken));
      expect(del.status).toBe(403);
      expect(await prisma.group.count({ where: { id: activeId } })).toBe(1);
    });
  });

  // PHASE5_SPECS.md 1.2: members read their own family (names and relationships) and nothing else.
  describe('families (G4)', () => {
    let familyId: string;
    let otherFamilyId: string;
    const asMember = () => bearer(memberToken);

    beforeAll(async () => {
      await prisma.user.update({
        where: { id: otherMemberId },
        data: { phone: '555-0199', address: '9 Hidden Road', city: 'Secretville' },
      });
      familyId = (
        await prisma.family.create({
          data: {
            familyName: 'Authz Family',
            address: '1 Private Lane',
            zipCode: '99999',
            headOfFamilyId: otherMemberId,
            members: { connect: [{ id: memberId }, { id: otherMemberId }] },
          },
        })
      ).id;
      const [low, high] = [memberId, otherMemberId].sort();
      await prisma.familyRelationship.create({
        data: {
          familyId,
          primaryUserId: low!,
          relatedUserId: high!,
          relationshipType: 'sibling',
        },
      });
      otherFamilyId = (
        await prisma.family.create({
          data: { familyName: 'Authz Elsewhere', members: { connect: [{ id: leaderId }] } },
        })
      ).id;
    });

    it("a member reads their own family's names and relationships, never contact details", async () => {
      const res = await request(app).get('/api/families/mine').set(asMember());
      expect(res.status).toBe(200);
      expect(res.body.family).toEqual({
        familyName: 'Authz Family',
        relatives: [{ name: 'Other Person', relationship: 'sibling' }],
      });
      expect(res.text).not.toMatch(
        /other@authorization|555-0199|Hidden Road|Secretville|Private Lane|99999|Authz Elsewhere/,
      );
      expect(res.text).not.toContain(otherMemberId);
      expect(res.text).not.toContain(familyId);
    });

    it('a member cannot list, read or change families, whether they exist or not', async () => {
      const missing = 'cmissingfamily000000000000';
      const tries = [
        request(app).get('/api/families'),
        request(app).get(`/api/families/${familyId}`),
        request(app).get(`/api/families/${otherFamilyId}`),
        request(app).get(`/api/families/${missing}`),
        request(app).post('/api/families').send({ familyName: 'Mine' }),
        request(app).patch(`/api/families/${familyId}`).send({ headOfFamilyId: memberId }),
        request(app).delete(`/api/families/${familyId}`),
        request(app).put(`/api/families/${otherFamilyId}/members/${memberId}`).send({ move: true }),
        request(app).delete(`/api/families/${familyId}/members/${otherMemberId}`),
        request(app)
          .put(`/api/families/${familyId}/relationships`)
          .send({ userId: memberId, relatedUserId: otherMemberId, type: 'spouse' }),
      ];
      // The role gate answers before any lookup, so the status says nothing about existence.
      for (const attempt of tries) {
        const res = await attempt.set(asMember());
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Insufficient permissions' });
      }
      const family = await prisma.family.findUniqueOrThrow({
        where: { id: familyId },
        include: { members: true, relationships: true },
      });
      expect(family.headOfFamilyId).toBe(otherMemberId);
      expect(family.members).toHaveLength(2);
      expect(family.relationships.map((r) => r.relationshipType)).toEqual(['sibling']);
      expect(await prisma.family.count({ where: { familyName: 'Mine' } })).toBe(0);
    });

    it('a leader reads and edits families but cannot delete one', async () => {
      const res = await request(app).get(`/api/families/${familyId}`).set(bearer(leaderToken));
      expect(res.status).toBe(200);
      expect(res.body.family.members.map((m: { name: string }) => m.name)).toContain(
        'Other Person',
      );
      const del = await request(app).delete(`/api/families/${familyId}`).set(bearer(leaderToken));
      expect(del.status).toBe(403);
      expect(await prisma.family.count({ where: { id: familyId } })).toBe(1);
    });
  });
});
