import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import {
  inverseRelationship,
  normaliseFamilyPair,
  setFamilyRelationship,
} from '../src/modules/member-details/service';
import { app, bearer, createUser, login, resetDatabase } from './helpers';

// P3-D3 (PHASE3_SPECS.md 1.2): real relations with their delete rules, the family pair stored
// once, the head of family derived from the family row, and case-insensitive email uniqueness.

const email = (name: string) => `${name}@relations.test.local`;

let adminId: string;
let adminToken: string;

beforeAll(async () => {
  await resetDatabase();
  adminId = (await createUser({ email: email('admin'), role: 'admin' })).id;
  adminToken = await login(email('admin'));
});

afterAll(async () => {
  await prisma.group.deleteMany({ where: { name: { startsWith: 'relations-' } } });
  await prisma.family.deleteMany({ where: { familyName: { startsWith: 'relations-' } } });
});

describe('delete rules', () => {
  it('sets null, cascades or restricts as the spec states', async () => {
    const staff = await createUser({ email: email('staff'), role: 'leader' });
    const member = await createUser({ email: email('member'), role: 'member' });

    const group = await prisma.group.create({
      data: { name: 'relations-choir', type: 'ministry', leaderId: staff.id },
    });
    const family = await prisma.family.create({
      data: { familyName: 'relations-staff', headOfFamilyId: staff.id },
    });
    const media = await prisma.media.create({
      data: {
        title: 'Sermon',
        type: 'YOUTUBE_VIDEO',
        url: 'https://www.youtube.com/watch?v=abcdefghijk',
        tags: [],
        uploadedById: staff.id,
      },
    });
    const interaction = await prisma.memberInteraction.create({
      data: {
        userId: member.id,
        staffMemberId: staff.id,
        interactionType: 'call_made',
        channel: 'phone',
      },
    });
    const tag = await prisma.memberTag.create({ data: { name: 'relations-tag' } });
    const userTag = await prisma.userTag.create({
      data: { userId: member.id, tagId: tag.id, addedById: staff.id },
    });
    const search = await prisma.savedSearch.create({
      data: { name: 'Mine', query: '{}', createdById: staff.id },
    });
    const note = await prisma.memberNote.create({
      data: { userId: member.id, authorId: staff.id, content: 'Visited' },
    });

    // The note's author is required: deleting them is refused while the note exists.
    const refused = await prisma.user.delete({ where: { id: staff.id } }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((refused as Prisma.PrismaClientKnownRequestError).code).toBe('P2003');

    await prisma.memberNote.delete({ where: { id: note.id } });
    await prisma.user.delete({ where: { id: staff.id } });

    expect((await prisma.group.findUniqueOrThrow({ where: { id: group.id } })).leaderId).toBeNull();
    expect(
      (await prisma.family.findUniqueOrThrow({ where: { id: family.id } })).headOfFamilyId,
    ).toBeNull();
    expect(
      (await prisma.media.findUniqueOrThrow({ where: { id: media.id } })).uploadedById,
    ).toBeNull();
    expect(
      (await prisma.memberInteraction.findUniqueOrThrow({ where: { id: interaction.id } }))
        .staffMemberId,
    ).toBeNull();
    expect(
      (await prisma.userTag.findUniqueOrThrow({ where: { id: userTag.id } })).addedById,
    ).toBeNull();
    expect(await prisma.savedSearch.findUnique({ where: { id: search.id } })).toBeNull();

    await prisma.memberTag.delete({ where: { id: tag.id } });
  });

  it('lists media whose uploader is gone', async () => {
    await prisma.media.create({
      data: {
        title: 'Orphan',
        type: 'YOUTUBE_VIDEO',
        url: 'https://www.youtube.com/watch?v=bcdefghijkl',
        tags: [],
        isApproved: true,
      },
    });
    const res = await request(app).get('/api/media').set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.media.map((m: { title: string }) => m.title)).toContain('Orphan');
  });
});

describe('the profile uses the relations', () => {
  it('names the note author and the staff member of an interaction', async () => {
    const member = await createUser({ email: email('profiled'), role: 'member' });
    const note = await request(app)
      .post(`/api/member-details/${member.id}/notes`)
      .set(bearer(adminToken))
      .send({ content: 'Welcome call done' });
    expect(note.status).toBe(200);
    expect(note.body.note.author).toEqual({ id: adminId, name: 'admin' });

    const interaction = await request(app)
      .post(`/api/member-details/${member.id}/interactions`)
      .set(bearer(adminToken))
      .send({ interactionType: 'call_made', channel: 'phone', subject: 'Hello' });
    expect(interaction.status).toBe(200);
    expect(interaction.body.interaction.staffMember).toEqual({ id: adminId, name: 'admin' });

    const res = await request(app).get(`/api/member-details/${member.id}`).set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.user.memberNotes[0].author).toEqual({ id: adminId, name: 'admin' });
    expect(res.body.user.interactions[0].staffMember).toEqual({ id: adminId, name: 'admin' });
    expect(res.body.user.isHeadOfFamily).toBe(false);

    const notes = await request(app)
      .get(`/api/member-details/${member.id}/notes`)
      .set(bearer(adminToken));
    expect(notes.body.notes[0].author.name).toBe('admin');
  });
});

describe('family pairs', () => {
  it('inverts directional types and keeps symmetric ones', () => {
    expect(inverseRelationship('parent')).toBe('child');
    expect(inverseRelationship('child')).toBe('parent');
    expect(inverseRelationship('grandparent')).toBe('grandchild');
    expect(inverseRelationship('grandchild')).toBe('grandparent');
    for (const t of ['spouse', 'sibling', 'other'] as const) expect(inverseRelationship(t)).toBe(t);
  });

  it('normalises a pair so primaryUserId < relatedUserId', () => {
    expect(
      normaliseFamilyPair({ primaryUserId: 'b', relatedUserId: 'a', relationshipType: 'parent' }),
    ).toEqual({ primaryUserId: 'a', relatedUserId: 'b', relationshipType: 'child' });
    const canonical = {
      primaryUserId: 'a',
      relatedUserId: 'b',
      relationshipType: 'spouse',
    } as const;
    expect(normaliseFamilyPair(canonical)).toEqual(canonical);
  });

  it('stores each pair once and shows each side its relative', async () => {
    const one = await createUser({ email: email('kin-one'), role: 'member', name: 'Kin One' });
    const two = await createUser({ email: email('kin-two'), role: 'member', name: 'Kin Two' });
    const [low, high] = one.id < two.id ? [one, two] : [two, one];
    const family = await prisma.family.create({
      data: { familyName: 'relations-kin', headOfFamilyId: high.id },
    });
    await prisma.user.updateMany({
      where: { id: { in: [low.id, high.id] } },
      data: { familyId: family.id },
    });

    // `high` is the parent of `low`, given from high's side first, then mirrored from low's.
    await setFamilyRelationship(family.id, {
      primaryUserId: high.id,
      relatedUserId: low.id,
      relationshipType: 'parent',
    });
    await setFamilyRelationship(family.id, {
      primaryUserId: low.id,
      relatedUserId: high.id,
      relationshipType: 'child',
    });
    const stored = await prisma.familyRelationship.findMany({ where: { familyId: family.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      primaryUserId: low.id,
      relatedUserId: high.id,
      relationshipType: 'child',
    });

    const fromLow = await request(app).get(`/api/member-details/${low.id}`).set(bearer(adminToken));
    expect(fromLow.body.user.familyMembers).toEqual([
      expect.objectContaining({ id: high.id, relationshipType: 'parent', isPrimary: true }),
    ]);
    expect(fromLow.body.user.isHeadOfFamily).toBe(false);
    expect(fromLow.body.user).not.toHaveProperty('headOfFamily');

    const fromHigh = await request(app)
      .get(`/api/member-details/${high.id}`)
      .set(bearer(adminToken));
    expect(fromHigh.body.user.familyMembers).toEqual([
      expect.objectContaining({ id: low.id, relationshipType: 'child', isPrimary: false }),
    ]);
    expect(fromHigh.body.user.isHeadOfFamily).toBe(true);

    // The unique index is on the pair alone: a second row for it is refused.
    await expect(
      prisma.familyRelationship.create({
        data: {
          familyId: family.id,
          primaryUserId: low.id,
          relatedUserId: high.id,
          relationshipType: 'sibling',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('email uniqueness is case-insensitive by construction', () => {
  it('lowercases on register and staff create, so no two accounts differ only by case', async () => {
    const registered = await request(app).post('/api/auth/register').send({
      name: 'Mixed',
      email: 'Mixed.Case@Relations.Test.Local',
      password: 'long-enough-pass1',
    });
    expect(registered.status).toBe(201);
    const row = await prisma.user.findFirstOrThrow({ where: { name: 'Mixed' } });
    expect(row.email).toBe('mixed.case@relations.test.local');

    const again = await request(app).post('/api/auth/register').send({
      name: 'Again',
      email: 'MIXED.CASE@relations.test.local',
      password: 'long-enough-pass1',
    });
    // Registration does not reveal existing accounts, and creates nothing for a known email.
    expect(again.status).toBe(201);
    expect(
      await prisma.user.count({
        where: { email: { equals: 'mixed.case@relations.test.local', mode: 'insensitive' } },
      }),
    ).toBe(1);

    const staffCreate = await request(app).post('/api/users').set(bearer(adminToken)).send({
      name: 'Dup',
      email: 'mixed.CASE@relations.test.local',
      password: 'long-enough-pass1',
    });
    expect(staffCreate.status).toBe(409);

    const created = await request(app)
      .post('/api/users')
      .set(bearer(adminToken))
      .send({ name: 'Upper', email: 'UPPER@Relations.Test.Local', password: 'long-enough-pass1' });
    expect(created.status).toBe(201);
    expect(created.body.user.email).toBe('upper@relations.test.local');

    // Every stored email is already lowercase, so the plain unique index is case-insensitive.
    const mixed = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "users" WHERE "email" <> lower("email")`;
    expect(Number(mixed[0]?.n)).toBe(0);
  });
});
