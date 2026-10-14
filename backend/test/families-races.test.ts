import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { app, bearer, createUser, login, resetDatabase } from './helpers';

// Concurrent family writes (review findings I-F1 to I-F3). Every family write locks the family
// row before it reads the members, the head or the relationships, so racing requests run one
// after another and the invariants hold whatever order they commit in:
// - the head is one of the members;
// - both people in a relationship are members of its family;
// - the audit log describes what was actually written.
// Each race runs several rounds, because the interleaving varies from run to run.

const ROUNDS = 8;

let admin: { Authorization: string };
let annId: string;
let benId: string;
let cyId: string;

const familyOf = async (userId: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).familyId;

async function familyWith(name: string, memberIds: string[]) {
  const family = await prisma.family.create({ data: { familyName: name } });
  await prisma.user.updateMany({ where: { id: { in: memberIds } }, data: { familyId: family.id } });
  return family.id;
}

/** The head is null or a member; every relationship joins two members of its family. */
async function expectFamilyInvariants(familyId: string) {
  const family = await prisma.family.findUniqueOrThrow({
    where: { id: familyId },
    select: {
      headOfFamilyId: true,
      members: { select: { id: true } },
      relationships: { select: { primaryUserId: true, relatedUserId: true } },
    },
  });
  const members = family.members.map((m) => m.id);
  if (family.headOfFamilyId) expect(members).toContain(family.headOfFamilyId);
  for (const r of family.relationships) {
    expect(members).toContain(r.primaryUserId);
    expect(members).toContain(r.relatedUserId);
  }
}

describe('family write races', () => {
  beforeAll(async () => {
    await resetDatabase();
    await createUser({ email: 'races-admin@races.test.local', role: 'admin' });
    annId = (await createUser({ email: 'ann@races.test.local', role: 'member', name: 'Ann' })).id;
    benId = (await createUser({ email: 'ben@races.test.local', role: 'member', name: 'Ben' })).id;
    cyId = (await createUser({ email: 'cy@races.test.local', role: 'member', name: 'Cy' })).id;
    admin = bearer(await login('races-admin@races.test.local'));
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.user.updateMany({ data: { familyId: null } });
    await prisma.familyRelationship.deleteMany();
    await prisma.family.deleteMany();
  });

  afterAll(resetDatabase);

  it('keeps the head a member when setting the head races removing that member', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const familyId = await familyWith(`Head ${round}`, [annId, benId]);
      const [patch, remove] = await Promise.all([
        request(app).patch(`/api/families/${familyId}`).set(admin).send({ headOfFamilyId: benId }),
        request(app).delete(`/api/families/${familyId}/members/${benId}`).set(admin),
      ]);
      expect(remove.status).toBe(200);
      // Removed first: Ben is no longer a member, so he cannot become the head.
      expect([200, 400]).toContain(patch.status);
      await expectFamilyInvariants(familyId);
      expect(await familyOf(benId)).toBe(null);
      await prisma.user.updateMany({ data: { familyId: null } });
    }
  });

  it('keeps both people in a relationship members when setting it races removing one', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const familyId = await familyWith(`Pair ${round}`, [annId, benId]);
      const [relate, remove] = await Promise.all([
        request(app)
          .put(`/api/families/${familyId}/relationships`)
          .set(admin)
          .send({ userId: annId, relatedUserId: benId, type: 'sibling' }),
        request(app).delete(`/api/families/${familyId}/members/${benId}`).set(admin),
      ]);
      expect(remove.status).toBe(200);
      expect([200, 400]).toContain(relate.status);
      await expectFamilyInvariants(familyId);
      expect(await prisma.familyRelationship.count({ where: { familyId } })).toBe(0);
      await prisma.user.updateMany({ data: { familyId: null } });
    }
  });

  it('moves two people in opposite directions between two families without a deadlock', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const first = await familyWith(`First ${round}`, [annId]);
      const second = await familyWith(`Second ${round}`, [benId]);
      const results = await Promise.all([
        request(app)
          .put(`/api/families/${second}/members/${annId}`)
          .set(admin)
          .send({ move: true }),
        request(app).put(`/api/families/${first}/members/${benId}`).set(admin).send({ move: true }),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(await familyOf(annId)).toBe(second);
      expect(await familyOf(benId)).toBe(first);
      await prisma.user.updateMany({ data: { familyId: null } });
    }
  });

  // The putMember versus deleteFamily audit inaccuracy: without the lock, a member added while
  // the family was being deleted was recorded as added, then unlinked by the delete without being
  // counted in its event.
  it('counts in the deletion event a member added while the family was being deleted', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const familyId = await familyWith(`Gone ${round}`, [annId]);
      const [put, del] = await Promise.all([
        request(app).put(`/api/families/${familyId}/members/${cyId}`).set(admin),
        request(app).delete(`/api/families/${familyId}`).set(admin),
      ]);
      expect(del.status).toBe(200);
      const events = await prisma.auditEvent.findMany({
        where: { targetId: familyId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const deleted = events.find((e) => e.action === 'family_deleted')!;
      if (put.status === 200) {
        // Added first: the deletion unlinked and counted both.
        expect(events.map((e) => e.action)).toEqual(['family_member_added', 'family_deleted']);
        expect(deleted.metadata).toMatchObject({ members: 2 });
      } else {
        expect(put.status).toBe(404);
        expect(events.map((e) => e.action)).toEqual(['family_deleted']);
        expect(deleted.metadata).toMatchObject({ members: 1 });
      }
      expect(await familyOf(cyId)).toBe(null);
      await prisma.auditEvent.deleteMany();
      await prisma.user.updateMany({ data: { familyId: null } });
    }
  });
});
