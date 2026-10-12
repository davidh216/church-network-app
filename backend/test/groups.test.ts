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
let member: { Authorization: string };
let leaderId: string;
let memberId: string;
let annId: string;
let benId: string;
let goneId: string;

const PUBLIC_KEYS = [
  'description',
  'id',
  'leaders',
  'location',
  'meetingDay',
  'meetingTime',
  'name',
  'type',
];

const auditEvents = () =>
  prisma.auditEvent.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

describe('groups (G3)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await createUser({ email: 'groups-admin@groups.test.local', role: 'admin' });
    leaderId = (await createUser({ email: 'groups-leader@groups.test.local', role: 'leader' })).id;
    memberId = (
      await createUser({ email: 'groups-member@groups.test.local', role: 'member', name: 'Mo' })
    ).id;
    annId = (await createUser({ email: 'ann@groups.test.local', role: 'member', name: 'Ann' })).id;
    benId = (await createUser({ email: 'ben@groups.test.local', role: 'member', name: 'Ben' })).id;
    goneId = (
      await createUser({
        email: 'gone@groups.test.local',
        role: 'member',
        name: 'Gone',
        isActive: false,
      })
    ).id;
    admin = bearer(await login('groups-admin@groups.test.local'));
    leader = bearer(await login('groups-leader@groups.test.local'));
    member = bearer(await login('groups-member@groups.test.local'));
  });

  beforeEach(async () => {
    vi.mocked(audit).mockClear();
    await prisma.auditEvent.deleteMany();
    await prisma.group.deleteMany();
  });

  afterAll(resetDatabase);

  const create = (body: object, as = leader) => request(app).post('/api/groups').set(as).send(body);
  const newGroup = async (body: object = {}) =>
    (await create({ name: 'Choir', type: 'ministry', ...body })).body.group as { id: string };
  const addMember = (groupId: string, body: object, as = leader) =>
    request(app).post(`/api/groups/${groupId}/members`).set(as).send(body);

  it('creates a group, trimmed with blanks as null, and audits it', async () => {
    const res = await create({
      name: '  Choir ',
      type: 'ministry',
      description: '',
      meetingDay: 'Wednesdays',
      meetingTime: '19:30',
      location: ' Hall ',
    });
    expect(res.status).toBe(201);
    expect(res.body.group).toMatchObject({
      name: 'Choir',
      type: 'ministry',
      description: null,
      meetingDay: 'Wednesdays',
      meetingTime: '19:30',
      location: 'Hall',
      isActive: true,
      memberCount: 0,
      leaders: [],
    });
    expect(await auditEvents()).toEqual([
      expect.objectContaining({
        action: 'group_created',
        actorId: leaderId,
        targetType: 'group',
        targetId: res.body.group.id,
        metadata: { name: 'Choir', type: 'ministry' },
      }),
    ]);
  });

  it('validates the fields', async () => {
    const res = await create({ name: 'x'.repeat(101), type: 'club', meetingDay: 'x'.repeat(61) });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.details).sort()).toEqual(['meetingDay', 'name', 'type']);
    expect((await create({ type: 'ministry' })).status).toBe(400);
  });

  it('rolls the change back when the audit write fails', async () => {
    vi.mocked(audit).mockRejectedValueOnce(new Error('audit down'));
    expect((await create({ name: 'Choir', type: 'ministry' })).status).toBe(500);
    expect(await prisma.group.count()).toBe(0);
  });

  it('names active leaders and co-leaders of active accounts, leaders first', async () => {
    const group = await newGroup();
    await prisma.groupMember.createMany({
      data: [
        { groupId: group.id, userId: benId, role: 'co_leader' },
        { groupId: group.id, userId: annId, role: 'co_leader' },
        { groupId: group.id, userId: leaderId, role: 'leader' },
        { groupId: group.id, userId: memberId, role: 'member' },
        { groupId: group.id, userId: goneId, role: 'leader' },
      ],
    });
    const res = await request(app).get(`/api/groups/${group.id}`).set(member);
    expect(res.body.group.leaders).toEqual([
      { name: 'groups-leader', role: 'leader' },
      { name: 'Ann', role: 'co_leader' },
      { name: 'Ben', role: 'co_leader' },
    ]);
    await prisma.groupMember.updateMany({ where: { userId: annId }, data: { isActive: false } });
    const after = await request(app).get(`/api/groups/${group.id}`).set(member);
    expect(after.body.group.leaders.map((l: { name: string }) => l.name)).toEqual([
      'groups-leader',
      'Ben',
    ]);
  });

  it('gives members active groups with public fields only; staff also archived ones and counts', async () => {
    const choir = await newGroup();
    await newGroup({ name: 'Archive', type: 'committee' });
    const archived = (await create({ name: 'Old', type: 'committee' })).body.group;
    await request(app).patch(`/api/groups/${archived.id}`).set(leader).send({ isActive: false });
    await prisma.groupMember.createMany({
      data: [
        { groupId: choir.id, userId: annId },
        { groupId: choir.id, userId: benId, isActive: false },
        { groupId: choir.id, userId: goneId },
      ],
    });

    const asMember = await request(app).get('/api/groups').set(member);
    expect(asMember.status).toBe(200);
    expect(asMember.body.groups.map((g: { name: string }) => g.name)).toEqual(['Archive', 'Choir']);
    for (const group of asMember.body.groups)
      expect(Object.keys(group).sort()).toEqual(PUBLIC_KEYS);

    const staff = await request(app).get('/api/groups?status=all').set(leader);
    expect(
      staff.body.groups.map((g: { name: string; isActive: boolean; memberCount: number }) => [
        g.name,
        g.isActive,
        g.memberCount,
      ]),
    ).toEqual([
      ['Archive', true, 0],
      ['Choir', true, 1],
      ['Old', false, 0],
    ]);
    const inactive = await request(app).get('/api/groups?status=inactive').set(leader);
    expect(inactive.body.groups.map((g: { name: string }) => g.name)).toEqual(['Old']);
    const byType = await request(app).get('/api/groups?type=committee').set(member);
    expect(byType.body.groups.map((g: { name: string }) => g.name)).toEqual(['Archive']);

    expect((await request(app).get('/api/groups?status=all').set(member)).status).toBe(403);
    expect((await request(app).get('/api/groups?status=maybe').set(leader)).status).toBe(400);
  });

  it('returns the roster to staff only, and 404 to members for an archived group', async () => {
    const group = await newGroup();
    await prisma.groupMember.createMany({
      data: [
        { groupId: group.id, userId: annId, joinDate: new Date('2026-01-02T00:00:00Z') },
        { groupId: group.id, userId: leaderId, role: 'leader' },
        { groupId: group.id, userId: goneId, isActive: false },
      ],
    });
    const staff = await request(app).get(`/api/groups/${group.id}`).set(leader);
    expect(staff.body.group.memberCount).toBe(2);
    expect(staff.body.group.roster).toEqual([
      expect.objectContaining({ userId: leaderId, role: 'leader', isActive: true }),
      {
        userId: annId,
        name: 'Ann',
        role: 'member',
        joinDate: '2026-01-02T00:00:00.000Z',
        isActive: true,
        userIsActive: true,
      },
      expect.objectContaining({ userId: goneId, isActive: false, userIsActive: false }),
    ]);

    const asMember = await request(app).get(`/api/groups/${group.id}`).set(member);
    expect(Object.keys(asMember.body.group).sort()).toEqual(PUBLIC_KEYS);

    await prisma.group.update({ where: { id: group.id }, data: { isActive: false } });
    const hidden = await request(app).get(`/api/groups/${group.id}`).set(member);
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual({ error: 'Group not found' });
    expect((await request(app).get(`/api/groups/${group.id}`).set(leader)).status).toBe(200);
    const missing = 'cmissinggroup0000000000000';
    expect((await request(app).get(`/api/groups/${missing}`).set(member)).status).toBe(404);
  });

  it("?mine=true lists the caller's active memberships with roles", async () => {
    const choir = await newGroup();
    const youth = await newGroup({ name: 'Youth', type: 'small_group' });
    const old = await newGroup({ name: 'Old', type: 'committee' });
    const left = await newGroup({ name: 'Left', type: 'committee' });
    await prisma.groupMember.createMany({
      data: [
        { groupId: choir.id, userId: memberId, role: 'co_leader' },
        { groupId: youth.id, userId: memberId },
        { groupId: old.id, userId: memberId },
        { groupId: left.id, userId: memberId, isActive: false },
        { groupId: youth.id, userId: annId, role: 'leader' },
      ],
    });
    await prisma.group.update({ where: { id: old.id }, data: { isActive: false } });
    const res = await request(app).get('/api/groups?mine=true').set(member);
    expect(res.status).toBe(200);
    expect(res.body.memberships).toEqual([
      {
        group: expect.objectContaining({
          name: 'Choir',
          leaders: [{ name: 'Mo', role: 'co_leader' }],
        }),
        role: 'co_leader',
        joinDate: expect.any(String),
      },
      {
        group: expect.objectContaining({
          name: 'Youth',
          leaders: [{ name: 'Ann', role: 'leader' }],
        }),
        role: 'member',
        joinDate: expect.any(String),
      },
    ]);
    for (const m of res.body.memberships) expect(Object.keys(m.group).sort()).toEqual(PUBLIC_KEYS);
    expect((await request(app).get('/api/groups?mine=true').set(leader)).body.memberships).toEqual(
      [],
    );
  });

  it('archives, restores and edits with the matching audit events', async () => {
    const group = await newGroup();
    const patch = (body: object) =>
      request(app).patch(`/api/groups/${group.id}`).set(leader).send(body);
    expect((await patch({ isActive: false })).body.group.isActive).toBe(false);
    expect((await patch({ isActive: true, location: 'Hall' })).body.group).toMatchObject({
      isActive: true,
      location: 'Hall',
    });
    expect((await patch({ name: 'Choir', location: 'Hall' })).status).toBe(200);
    expect((await patch({ location: '' })).body.group.location).toBeNull();
    expect((await auditEvents()).map((e) => [e.action, e.metadata])).toEqual([
      ['group_created', { name: 'Choir', type: 'ministry' }],
      ['group_archived', { name: 'Choir', changes: { isActive: { from: true, to: false } } }],
      [
        'group_updated',
        {
          name: 'Choir',
          changes: { isActive: { from: false, to: true }, location: { from: null, to: 'Hall' } },
        },
      ],
      ['group_updated', { name: 'Choir', changes: { location: { from: 'Hall', to: null } } }],
    ]);
    expect(
      (
        await request(app)
          .patch('/api/groups/cmissinggroup0000000000000')
          .set(leader)
          .send({ name: 'X' })
      ).status,
    ).toBe(404);
  });

  it('lets only an admin delete a group, removing its roster', async () => {
    const group = await newGroup();
    await prisma.groupMember.createMany({
      data: [
        { groupId: group.id, userId: annId },
        { groupId: group.id, userId: benId },
      ],
    });
    expect((await request(app).delete(`/api/groups/${group.id}`).set(leader)).status).toBe(403);
    const res = await request(app).delete(`/api/groups/${group.id}`).set(admin);
    expect(res.body).toEqual({ success: true, removed: 2 });
    expect(await prisma.groupMember.count({ where: { groupId: group.id } })).toBe(0);
    expect((await auditEvents()).at(-1)).toMatchObject({
      action: 'group_deleted',
      targetId: group.id,
      count: 2,
      metadata: { name: 'Choir' },
    });
    expect((await request(app).delete(`/api/groups/${group.id}`).set(admin)).status).toBe(404);
  });

  describe('roster', () => {
    it('adds an active member once, with a default role, and audits it', async () => {
      const group = await newGroup();
      const res = await addMember(group.id, { userId: annId });
      expect(res.status).toBe(201);
      expect(res.body.member).toMatchObject({
        userId: annId,
        name: 'Ann',
        role: 'member',
        isActive: true,
      });
      const again = await addMember(group.id, { userId: annId, role: 'leader' });
      expect(again.status).toBe(409);
      expect(again.body).toMatchObject({
        error: 'This member is already in the group',
        code: 'CONFLICT',
      });

      const inactive = await addMember(group.id, { userId: goneId });
      expect(inactive.status).toBe(400);
      expect(inactive.body.error).toBe('Only active members can be added to a group');
      expect((await addMember(group.id, { userId: 'cmissinguser00000000000000' })).status).toBe(
        404,
      );
      expect((await addMember('cmissinggroup0000000000000', { userId: benId })).status).toBe(404);
      expect((await addMember(group.id, { userId: benId, role: 'boss' })).status).toBe(400);

      expect((await auditEvents()).at(-1)).toMatchObject({
        action: 'group_member_added',
        targetType: 'group',
        targetId: group.id,
        metadata: { name: 'Choir', memberId: annId, memberName: 'Ann', role: 'member' },
      });
    });

    it('changes a role or the active flag, and removes a member', async () => {
      const group = await newGroup();
      await addMember(group.id, { userId: annId });
      const url = `/api/groups/${group.id}/members/${annId}`;
      const promoted = await request(app).patch(url).set(leader).send({ role: 'co_leader' });
      expect(promoted.body.member).toMatchObject({ role: 'co_leader', isActive: true });
      const same = await request(app).patch(url).set(leader).send({ role: 'co_leader' });
      expect(same.status).toBe(200);
      const paused = await request(app).patch(url).set(leader).send({ isActive: false });
      expect(paused.body.member.isActive).toBe(false);
      expect((await request(app).delete(url).set(leader)).body).toEqual({ success: true });
      expect((await request(app).delete(url).set(leader)).status).toBe(404);
      expect((await request(app).patch(url).set(leader).send({ role: 'leader' })).status).toBe(404);

      expect((await auditEvents()).slice(2).map((e) => [e.action, e.metadata])).toEqual([
        [
          'group_member_updated',
          {
            name: 'Choir',
            memberId: annId,
            memberName: 'Ann',
            changes: { role: { from: 'member', to: 'co_leader' } },
          },
        ],
        [
          'group_member_updated',
          {
            name: 'Choir',
            memberId: annId,
            memberName: 'Ann',
            changes: { isActive: { from: true, to: false } },
          },
        ],
        [
          'group_member_removed',
          { name: 'Choir', memberId: annId, memberName: 'Ann', role: 'co_leader' },
        ],
      ]);
    });

    it('shows on the staff profile, archived groups and inactive rows included', async () => {
      const group = await newGroup();
      const old = await newGroup({ name: 'Old', type: 'committee' });
      await addMember(group.id, { userId: annId, role: 'leader' });
      await addMember(old.id, { userId: annId });
      await request(app).patch(`/api/groups/${old.id}`).set(leader).send({ isActive: false });
      const res = await request(app).get(`/api/member-details/${annId}`).set(leader);
      expect(res.body.user.groupMemberships).toEqual([
        {
          group: { id: group.id, name: 'Choir', type: 'ministry', isActive: true },
          role: 'leader',
          joinDate: expect.any(String),
          isActive: true,
        },
        {
          group: { id: old.id, name: 'Old', type: 'committee', isActive: false },
          role: 'member',
          joinDate: expect.any(String),
          isActive: true,
        },
      ]);
    });
  });
});
