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
let cyId: string;

const MISSING = 'cmissingfamily000000000000';

const auditEvents = () =>
  prisma.auditEvent.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

describe('families (G4)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await createUser({ email: 'families-admin@families.test.local', role: 'admin' });
    leaderId = (await createUser({ email: 'families-leader@families.test.local', role: 'leader' }))
      .id;
    memberId = (
      await createUser({ email: 'families-member@families.test.local', role: 'member', name: 'Mo' })
    ).id;
    annId = (await createUser({ email: 'ann@families.test.local', role: 'member', name: 'Ann' }))
      .id;
    benId = (await createUser({ email: 'ben@families.test.local', role: 'member', name: 'Ben' }))
      .id;
    cyId = (await createUser({ email: 'cy@families.test.local', role: 'member', name: 'Cy' })).id;
    admin = bearer(await login('families-admin@families.test.local'));
    leader = bearer(await login('families-leader@families.test.local'));
    member = bearer(await login('families-member@families.test.local'));
  });

  beforeEach(async () => {
    vi.mocked(audit).mockClear();
    await prisma.auditEvent.deleteMany();
    await prisma.familyRelationship.deleteMany();
    await prisma.family.deleteMany();
  });

  afterAll(resetDatabase);

  const create = (body: object, as = leader) =>
    request(app).post('/api/families').set(as).send(body);
  const newFamily = async (body: object = {}) =>
    (await create({ familyName: 'Doe', ...body })).body.family as { id: string };
  const put = (familyId: string, userId: string, body?: object) => {
    const req = request(app).put(`/api/families/${familyId}/members/${userId}`).set(leader);
    return body ? req.send(body) : req;
  };
  const relate = (familyId: string, body: object) =>
    request(app).put(`/api/families/${familyId}/relationships`).set(leader).send(body);
  const familyOf = async (userId: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).familyId;

  it('creates a family, trimmed with blank address fields as null, and audits it', async () => {
    const res = await create({ familyName: ' Doe ', address: ' 1 Main St ', city: '' });
    expect(res.status).toBe(201);
    expect(res.body.family).toMatchObject({
      familyName: 'Doe',
      address: '1 Main St',
      city: null,
      head: null,
      members: [],
      relationships: [],
    });
    expect(await auditEvents()).toEqual([
      expect.objectContaining({
        action: 'family_created',
        actorId: leaderId,
        targetType: 'family',
        targetId: res.body.family.id,
        metadata: { name: 'Doe' },
      }),
    ]);
    const invalid = await create({ familyName: ' ', zipCode: 'x'.repeat(21) });
    expect(invalid.status).toBe(400);
    expect(Object.keys(invalid.body.details).sort()).toEqual(['familyName', 'zipCode']);
  });

  it('creates a family around its head, who joins it; a head elsewhere is a 409', async () => {
    const res = await create({ familyName: 'Roe', headOfFamilyId: annId });
    expect(res.status).toBe(201);
    expect(res.body.family.head).toEqual({ id: annId, name: 'Ann' });
    expect(res.body.family.members).toEqual([
      { id: annId, name: 'Ann', email: 'ann@families.test.local', isActive: true, isHead: true },
    ]);
    expect((await auditEvents()).map((e) => e.action)).toEqual([
      'family_created',
      'family_member_added',
    ]);
    const again = await create({ familyName: 'Poe', headOfFamilyId: annId });
    expect(again.status).toBe(409);
    expect(again.body).toEqual({
      error: 'Ann already belongs to the Roe family',
      code: 'IN_OTHER_FAMILY',
    });
    expect(await prisma.family.count({ where: { familyName: 'Poe' } })).toBe(0);
    await prisma.user.update({ where: { id: annId }, data: { familyId: null } });
  });

  it('rolls the change back when the audit write fails', async () => {
    vi.mocked(audit).mockRejectedValueOnce(new Error('audit down'));
    expect((await create({ familyName: 'Doe' })).status).toBe(500);
    expect(await prisma.family.count()).toBe(0);
  });

  it('lists families by name with a literal search, paging, member counts and the head', async () => {
    const doe = await newFamily();
    await newFamily({ familyName: '100% Smith' });
    await newFamily({ familyName: 'Abbot' });
    await put(doe.id, annId);
    await put(doe.id, benId);
    await request(app).patch(`/api/families/${doe.id}`).set(leader).send({ headOfFamilyId: benId });

    const all = await request(app).get('/api/families').set(leader);
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ total: 3, page: 1, pageSize: 25 });
    expect(
      all.body.families.map((f: { familyName: string; memberCount: number }) => [
        f.familyName,
        f.memberCount,
      ]),
    ).toEqual([
      ['100% Smith', 0],
      ['Abbot', 0],
      ['Doe', 2],
    ]);
    expect(all.body.families[2].head).toEqual({ id: benId, name: 'Ben' });
    const percent = await request(app).get('/api/families?q=%25').set(leader);
    expect(percent.body.families.map((f: { familyName: string }) => f.familyName)).toEqual([
      '100% Smith',
    ]);
    const paged = await request(app).get('/api/families?page=2&pageSize=2').set(leader);
    expect(paged.body.families.map((f: { familyName: string }) => f.familyName)).toEqual(['Doe']);
    await prisma.user.updateMany({ where: { familyId: doe.id }, data: { familyId: null } });
  });

  it('edits the name, address and head; the head must be a member', async () => {
    const family = await newFamily();
    await put(family.id, annId);
    const patch = (body: object) =>
      request(app).patch(`/api/families/${family.id}`).set(leader).send(body);
    const outsider = await patch({ headOfFamilyId: benId });
    expect(outsider.status).toBe(400);
    expect(outsider.body.details).toEqual({
      headOfFamilyId: ['The head of family must be a member of the family'],
    });
    const res = await patch({ headOfFamilyId: annId, city: 'Springfield', familyName: 'Doe' });
    expect(res.body.family).toMatchObject({
      city: 'Springfield',
      head: { id: annId, name: 'Ann' },
      members: [expect.objectContaining({ id: annId, isHead: true })],
    });
    expect((await patch({ city: 'Springfield' })).status).toBe(200);
    expect((await patch({ headOfFamilyId: null })).body.family.head).toBeNull();
    expect(
      (await auditEvents()).filter((e) => e.action === 'family_updated').map((e) => e.metadata),
    ).toEqual([
      {
        name: 'Doe',
        changes: {
          city: { from: null, to: 'Springfield' },
          headOfFamilyId: { from: null, to: annId },
        },
      },
      { name: 'Doe', changes: { headOfFamilyId: { from: annId, to: null } } },
    ]);
    expect(
      (await request(app).patch(`/api/families/${MISSING}`).set(leader).send({ city: 'X' })).status,
    ).toBe(404);
    await prisma.user.update({ where: { id: annId }, data: { familyId: null } });
  });

  describe('membership', () => {
    it('adds a member once (idempotent), and 404s for a missing user or family', async () => {
      const family = await newFamily();
      const res = await put(family.id, annId);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        member: {
          id: annId,
          name: 'Ann',
          email: 'ann@families.test.local',
          isActive: true,
          isHead: false,
        },
        movedFrom: null,
      });
      expect((await put(family.id, annId, { move: true })).status).toBe(200);
      expect((await auditEvents()).map((e) => [e.action, e.metadata])).toEqual([
        ['family_created', { name: 'Doe' }],
        ['family_member_added', { name: 'Doe', memberId: annId, memberName: 'Ann' }],
      ]);
      expect((await put(family.id, 'cmissinguser00000000000000')).status).toBe(404);
      expect((await put(MISSING, annId)).status).toBe(404);
      expect((await put(family.id, benId, { move: 'yes' })).status).toBe(400);
      await prisma.user.update({ where: { id: annId }, data: { familyId: null } });
    });

    it('refuses someone in another family with 409 unless moved; a move cleans the old family', async () => {
      const old = await newFamily({ familyName: 'Old' });
      const next = await newFamily({ familyName: 'New' });
      await put(old.id, annId);
      await put(old.id, benId);
      await request(app)
        .patch(`/api/families/${old.id}`)
        .set(leader)
        .send({ headOfFamilyId: annId });
      await relate(old.id, { userId: annId, relatedUserId: benId, type: 'spouse' });

      const refused = await put(next.id, annId);
      expect(refused.status).toBe(409);
      expect(refused.body).toEqual({
        error: 'Ann already belongs to the Old family',
        code: 'IN_OTHER_FAMILY',
      });
      expect(await familyOf(annId)).toBe(old.id);

      const moved = await put(next.id, annId, { move: true });
      expect(moved.status).toBe(200);
      expect(moved.body.movedFrom).toEqual({ id: old.id, familyName: 'Old' });
      expect(await familyOf(annId)).toBe(next.id);
      expect(await prisma.familyRelationship.count()).toBe(0);
      const oldNow = await request(app).get(`/api/families/${old.id}`).set(leader);
      expect(oldNow.body.family).toMatchObject({ head: null, relationships: [] });
      expect(oldNow.body.family.members.map((m: { name: string }) => m.name)).toEqual(['Ben']);
      expect(
        (await auditEvents()).slice(-2).map((e) => [e.action, e.targetId, e.count, e.metadata]),
      ).toEqual([
        [
          'family_member_removed',
          old.id,
          1,
          {
            name: 'Old',
            memberId: annId,
            memberName: 'Ann',
            relationships: 1,
            wasHead: true,
            movedTo: { id: next.id, name: 'New' },
          },
        ],
        [
          'family_member_added',
          next.id,
          null,
          {
            name: 'New',
            memberId: annId,
            memberName: 'Ann',
            movedFrom: { id: old.id, name: 'Old' },
          },
        ],
      ]);
      await prisma.user.updateMany({
        where: { id: { in: [annId, benId] } },
        data: { familyId: null },
      });
    });

    it('removes a member with their relationships and the head, 404 for a non-member', async () => {
      const family = await newFamily();
      for (const id of [annId, benId, cyId]) await put(family.id, id);
      await request(app)
        .patch(`/api/families/${family.id}`)
        .set(leader)
        .send({ headOfFamilyId: annId });
      await relate(family.id, { userId: annId, relatedUserId: benId, type: 'parent' });
      await relate(family.id, { userId: benId, relatedUserId: cyId, type: 'sibling' });
      const url = `/api/families/${family.id}/members/${annId}`;
      const res = await request(app).delete(url).set(leader);
      expect(res.body).toEqual({ success: true, relationships: 1, wasHead: true });
      expect(await familyOf(annId)).toBeNull();
      const detail = (await request(app).get(`/api/families/${family.id}`).set(leader)).body.family;
      expect(detail.head).toBeNull();
      expect(detail.relationships).toHaveLength(1);
      expect((await request(app).delete(url).set(leader)).status).toBe(404);
      expect((await auditEvents()).at(-1)).toMatchObject({
        action: 'family_member_removed',
        count: 1,
        metadata: {
          name: 'Doe',
          memberId: annId,
          memberName: 'Ann',
          relationships: 1,
          wasHead: true,
        },
      });
      await prisma.user.updateMany({ where: { familyId: family.id }, data: { familyId: null } });
    });
  });

  describe('relationships', () => {
    it('stores a pair once whichever side it is given from, and shows both sides', async () => {
      const family = await newFamily();
      for (const id of [annId, benId]) await put(family.id, id);
      // Ann is Ben's parent, said from Ann's side and then from Ben's.
      const first = await relate(family.id, {
        userId: annId,
        relatedUserId: benId,
        type: 'parent',
      });
      expect(first.status).toBe(200);
      const fromAnn = { user: 'Ann', related: 'Ben', type: 'parent', inverse: 'child' };
      const fromBen = { user: 'Ben', related: 'Ann', type: 'child', inverse: 'parent' };
      const view = (r: {
        user: { name: string };
        relatedUser: { name: string };
        type: string;
        inverseType: string;
      }) => ({
        user: r.user.name,
        related: r.relatedUser.name,
        type: r.type,
        inverse: r.inverseType,
      });
      expect([fromAnn, fromBen]).toContainEqual(view(first.body.relationship));
      const same = await relate(family.id, { userId: benId, relatedUserId: annId, type: 'child' });
      expect(same.body.relationship.id).toBe(first.body.relationship.id);
      expect(await prisma.familyRelationship.count()).toBe(1);
      // Unchanged: one event only.
      expect(
        (await auditEvents()).filter((e) => e.action === 'family_relationship_set'),
      ).toHaveLength(1);

      const changed = await relate(family.id, {
        userId: benId,
        relatedUserId: annId,
        type: 'spouse',
      });
      expect(changed.body.relationship.type).toBe('spouse');
      expect((await auditEvents()).at(-1)!.metadata).toEqual({
        name: 'Doe',
        relationshipId: first.body.relationship.id,
        userId: benId,
        userName: 'Ben',
        relatedUserId: annId,
        relatedUserName: 'Ann',
        type: 'spouse',
        previousType: 'child',
      });
      const detail = (await request(app).get(`/api/families/${family.id}`).set(leader)).body.family;
      expect(detail.relationships).toEqual([changed.body.relationship]);
      await prisma.user.updateMany({ where: { familyId: family.id }, data: { familyId: null } });
    });

    it('needs two different members of the family', async () => {
      const family = await newFamily();
      await put(family.id, annId);
      const outsider = await relate(family.id, {
        userId: annId,
        relatedUserId: cyId,
        type: 'sibling',
      });
      expect(outsider.status).toBe(400);
      expect(outsider.body.details).toEqual({
        relatedUserId: ['Both people must be members of this family'],
      });
      const self = await relate(family.id, { userId: annId, relatedUserId: annId, type: 'other' });
      expect(self.status).toBe(400);
      expect(self.body.details).toEqual({ relatedUserId: ['Choose two different people'] });
      expect(
        (await relate(MISSING, { userId: annId, relatedUserId: benId, type: 'other' })).status,
      ).toBe(404);
      await prisma.user.update({ where: { id: annId }, data: { familyId: null } });
    });

    it('deletes a relationship of this family only, and audits it', async () => {
      const family = await newFamily();
      const other = await newFamily({ familyName: 'Other' });
      for (const id of [annId, benId]) await put(family.id, id);
      const rel = (
        await relate(family.id, { userId: annId, relatedUserId: benId, type: 'sibling' })
      ).body.relationship;
      const wrong = await request(app)
        .delete(`/api/families/${other.id}/relationships/${rel.id}`)
        .set(leader);
      expect(wrong.status).toBe(404);
      const res = await request(app)
        .delete(`/api/families/${family.id}/relationships/${rel.id}`)
        .set(leader);
      expect(res.body).toEqual({ success: true });
      expect(await prisma.familyRelationship.count()).toBe(0);
      expect((await auditEvents()).at(-1)).toMatchObject({
        action: 'family_relationship_removed',
        targetId: family.id,
        metadata: { name: 'Doe', relationshipId: rel.id, type: expect.any(String) },
      });
      await prisma.user.updateMany({ where: { familyId: family.id }, data: { familyId: null } });
    });
  });

  it('lets only an admin delete a family, unlinking its members', async () => {
    const family = await newFamily();
    for (const id of [annId, benId]) await put(family.id, id);
    await relate(family.id, { userId: annId, relatedUserId: benId, type: 'spouse' });
    expect((await request(app).delete(`/api/families/${family.id}`).set(leader)).status).toBe(403);
    const res = await request(app).delete(`/api/families/${family.id}`).set(admin);
    expect(res.body).toEqual({ success: true, members: 2, relationships: 1 });
    expect(await familyOf(annId)).toBeNull();
    expect(await prisma.familyRelationship.count()).toBe(0);
    expect((await auditEvents()).at(-1)).toMatchObject({
      action: 'family_deleted',
      count: 2,
      metadata: { name: 'Doe', members: 2, relationships: 1 },
    });
    expect((await request(app).delete(`/api/families/${family.id}`).set(admin)).status).toBe(404);
  });

  it("gives a member their own family's names and relationships, from their side only", async () => {
    expect((await request(app).get('/api/families/mine').set(member)).body).toEqual({
      success: true,
      family: null,
    });
    const family = await newFamily({ address: '1 Secret Lane' });
    for (const id of [memberId, annId, benId, cyId]) await put(family.id, id);
    await relate(family.id, { userId: annId, relatedUserId: memberId, type: 'parent' });
    await relate(family.id, { userId: memberId, relatedUserId: benId, type: 'spouse' });
    // Not about the caller: never shown to them.
    await relate(family.id, { userId: annId, relatedUserId: cyId, type: 'grandparent' });
    await prisma.familyRelationship.updateMany({
      where: { OR: [{ primaryUserId: benId }, { relatedUserId: benId }] },
      data: { isActive: false },
    });
    const res = await request(app).get('/api/families/mine').set(member);
    expect(res.body.family).toEqual({
      familyName: 'Doe',
      relatives: [
        { name: 'Ann', relationship: 'parent' },
        { name: 'Ben', relationship: null },
        { name: 'Cy', relationship: null },
      ],
    });
    expect(res.text).not.toMatch(/@|Secret|"id"/);
    await prisma.user.updateMany({ where: { familyId: family.id }, data: { familyId: null } });
  });

  it('shows the staff profile the family name and address and only its active relationships', async () => {
    const family = await newFamily({ familyName: 'Doe', city: 'Springfield' });
    const old = await newFamily({ familyName: 'Old' });
    for (const id of [annId, benId, cyId]) await put(family.id, id);
    await put(old.id, memberId);
    await relate(family.id, { userId: benId, relatedUserId: annId, type: 'parent' });
    await relate(family.id, { userId: cyId, relatedUserId: annId, type: 'sibling' });
    await prisma.familyRelationship.updateMany({
      where: { OR: [{ primaryUserId: cyId }, { relatedUserId: cyId }] },
      data: { isActive: false },
    });
    // A stale row naming someone outside Ann's family is not shown either.
    const [p, r] = [annId, memberId].sort();
    await prisma.familyRelationship.create({
      data: { familyId: old.id, primaryUserId: p!, relatedUserId: r!, relationshipType: 'other' },
    });
    const res = await request(app).get(`/api/member-details/${annId}`).set(leader);
    expect(res.body.user.family).toMatchObject({
      id: family.id,
      familyName: 'Doe',
      city: 'Springfield',
      address: null,
    });
    expect(res.body.user.familyMembers).toEqual([
      expect.objectContaining({ id: benId, name: 'Ben', relationshipType: 'parent' }),
    ]);
    expect(res.body.user).not.toHaveProperty('familyRelationships');
    expect(res.body.user).not.toHaveProperty('relatedFamilyMembers');
    await prisma.user.updateMany({
      where: { familyId: { in: [family.id, old.id] } },
      data: { familyId: null },
    });
  });
});
