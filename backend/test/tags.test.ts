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
let otherId: string;

const auditActions = async () =>
  (await prisma.auditEvent.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })).map(
    (e) => e.action,
  );

describe('tags (G2)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await createUser({ email: 'tags-admin@tags.test.local', role: 'admin' });
    leaderId = (await createUser({ email: 'tags-leader@tags.test.local', role: 'leader' })).id;
    memberId = (await createUser({ email: 'tags-member@tags.test.local', role: 'member' })).id;
    otherId = (
      await createUser({ email: 'tags-other@tags.test.local', role: 'member', name: 'Other' })
    ).id;
    admin = bearer(await login('tags-admin@tags.test.local'));
    leader = bearer(await login('tags-leader@tags.test.local'));
    member = bearer(await login('tags-member@tags.test.local'));
  });

  beforeEach(async () => {
    vi.mocked(audit).mockClear();
    await prisma.auditEvent.deleteMany();
    await prisma.memberTag.deleteMany();
  });

  afterAll(resetDatabase);

  const create = (body: object, as = leader) => request(app).post('/api/tags').set(as).send(body);
  const assign = (userId: string, tagId: string, as = leader) =>
    request(app).post(`/api/users/${userId}/tags`).set(as).send({ tagId });

  it('creates a tag with defaults, trimmed, and audits it', async () => {
    const res = await create({ name: '  Choir ' });
    expect(res.status).toBe(201);
    expect(res.body.tag).toMatchObject({
      name: 'Choir',
      color: '#3B82F6',
      category: 'general',
      isActive: true,
      usageCount: 0,
    });
    const [event] = await prisma.auditEvent.findMany();
    expect(event).toMatchObject({
      action: 'tag_created',
      actorId: leaderId,
      targetType: 'tag',
      targetId: res.body.tag.id,
      metadata: { name: 'Choir', color: '#3B82F6', category: 'general' },
    });
  });

  it('refuses a name already used in any letter case, on create and on rename', async () => {
    await create({ name: 'Choir' });
    const other = (await create({ name: 'Youth' })).body.tag;
    const dup = await create({ name: 'CHOIR' });
    expect(dup.status).toBe(409);
    expect(dup.body).toMatchObject({ error: 'A tag with this name already exists' });
    const rename = await request(app)
      .patch(`/api/tags/${other.id}`)
      .set(leader)
      .send({ name: 'choir' });
    expect(rename.status).toBe(409);
    // Changing only the case of its own name is allowed.
    const recase = await request(app)
      .patch(`/api/tags/${other.id}`)
      .set(leader)
      .send({ name: 'YOUTH' });
    expect(recase.status).toBe(200);
    expect(await prisma.memberTag.count()).toBe(2);
    // LIKE wildcards in a name match literally.
    expect((await create({ name: 'Ch_ir' })).status).toBe(201);
  });

  it('creates only one of several concurrent tags whose names differ only in letter case', async () => {
    for (let round = 0; round < 5; round++) {
      const names = ['Choir', 'choir', 'CHOIR', 'cHoIr'].map((n) => `${n}${round}`);
      const results = await Promise.all(names.map((name) => create({ name })));
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
      expect(
        await prisma.memberTag.count({
          where: { name: { equals: `choir${round}`, mode: 'insensitive' } },
        }),
      ).toBe(1);
    }
    // Renames too: two tags renamed at once to the same name in different cases.
    const [a, b] = [
      (await create({ name: 'A' })).body.tag.id,
      (await create({ name: 'B' })).body.tag.id,
    ];
    const renames = await Promise.all([
      request(app).patch(`/api/tags/${a}`).set(leader).send({ name: 'Youth' }),
      request(app).patch(`/api/tags/${b}`).set(leader).send({ name: 'YOUTH' }),
    ]);
    expect(renames.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('validates the name, colour and category', async () => {
    for (const body of [
      { name: '' },
      { name: '   ' },
      { name: 'x'.repeat(41) },
      { name: 'Ok', color: 'red' },
      { name: 'Ok', color: '#12345' },
      { name: 'Ok', category: 'pastoral' },
    ])
      expect((await create(body)).status, JSON.stringify(body)).toBe(400);
    expect((await create({ name: 'x'.repeat(40), color: '#a1B2c3' })).status).toBe(201);
  });

  it('archives and restores, lists archived tags only on request, with usage counts', async () => {
    const choir = (await create({ name: 'Choir' })).body.tag;
    await create({ name: 'Youth' });
    await assign(memberId, choir.id);
    await assign(otherId, choir.id);
    const archived = await request(app)
      .patch(`/api/tags/${choir.id}`)
      .set(leader)
      .send({ isActive: false, color: '#000000' });
    expect(archived.status).toBe(200);
    expect(archived.body.tag).toMatchObject({ isActive: false, usageCount: 2 });

    const names = async (query: string) =>
      (await request(app).get(`/api/tags${query}`).set(leader)).body.tags.map(
        (t: { name: string; usageCount: number }) => `${t.name}:${t.usageCount}`,
      );
    expect(await names('')).toEqual(['Youth:0']);
    expect(await names('?includeArchived=true')).toEqual(['Choir:2', 'Youth:0']);
    expect((await request(app).get('/api/tags?includeArchived=yes').set(leader)).status).toBe(400);

    await request(app).patch(`/api/tags/${choir.id}`).set(leader).send({ isActive: true });
    // A PATCH that changes nothing records nothing.
    await request(app).patch(`/api/tags/${choir.id}`).set(leader).send({ isActive: true });
    expect(await auditActions()).toEqual([
      'tag_created',
      'tag_created',
      'tag_assigned',
      'tag_assigned',
      'tag_archived',
      'tag_updated',
    ]);
    const restore = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'tag_updated' } });
    expect(restore.metadata).toEqual({
      name: 'Choir',
      changes: { isActive: { from: false, to: true } },
    });
  });

  it('never newly assigns an archived tag, but keeps and shows existing assignments', async () => {
    const tag = (await create({ name: 'Visitors 2025' })).body.tag;
    expect((await assign(memberId, tag.id)).status).toBe(200);
    await request(app).patch(`/api/tags/${tag.id}`).set(leader).send({ isActive: false });

    const refused = await assign(otherId, tag.id);
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('TAG_ARCHIVED');
    // Assigning it again to the member who has it is still a no-op success.
    const again = await assign(memberId, tag.id);
    expect(again.status).toBe(200);
    expect(again.body.added).toBe(false);

    const list = await request(app).get('/api/users?q=tags-member').set(leader);
    expect(list.body.users[0].memberTags).toEqual([
      { tag: { id: tag.id, name: 'Visitors 2025', color: '#3B82F6', isActive: false } },
    ]);
    const profile = await request(app).get(`/api/member-details/${memberId}`).set(leader);
    expect(profile.body.user.memberTags).toMatchObject([
      { tag: { name: 'Visitors 2025', isActive: false } },
    ]);
  });

  it('does not assign a tag that is being archived at the same moment', async () => {
    const tag = (await create({ name: 'Closing' })).body.tag;
    const { audit: realAudit } =
      await vi.importActual<typeof import('../src/lib/audit')>('../src/lib/audit');
    let reached!: () => void;
    let release!: () => void;
    const atGate = new Promise<void>((resolve) => (reached = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    // The archive has updated the row and waits, uncommitted, at its audit call.
    vi.mocked(audit).mockImplementationOnce(((...args: Parameters<typeof audit>) => {
      reached();
      return gate.then(() => realAudit(...args));
    }) as unknown as typeof audit);
    const archiving = request(app)
      .patch(`/api/tags/${tag.id}`)
      .set(leader)
      .send({ isActive: false })
      .then((res) => res);
    await atGate;
    const assigning = assign(memberId, tag.id).then((res) => res);
    // Let the assignment reach the tag row: it waits there for the archive (at most 2 s).
    for (let i = 0; i < 40; i++) {
      const [row] = await prisma.$queryRaw<{ waiting: number }[]>`
        SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      if (row!.waiting > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    release();
    expect((await archiving).status).toBe(200);
    const refused = await assigning;
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('TAG_ARCHIVED');
    expect(await prisma.userTag.count({ where: { tagId: tag.id } })).toBe(0);
  });

  it('assigns idempotently, unassigns, and audits each change once', async () => {
    const tag = (await create({ name: 'Greeter' })).body.tag;
    const first = await assign(memberId, tag.id);
    expect(first.body).toMatchObject({ added: true, memberTags: [{ tag: { name: 'Greeter' } }] });
    expect((await assign(memberId, tag.id)).body.added).toBe(false);
    expect(await prisma.userTag.count({ where: { userId: memberId } })).toBe(1);
    expect((await prisma.userTag.findFirstOrThrow()).addedById).toBe(leaderId);

    const removed = await request(app).delete(`/api/users/${memberId}/tags/${tag.id}`).set(leader);
    expect(removed.status).toBe(200);
    expect(removed.body.memberTags).toEqual([]);
    expect(
      (await request(app).delete(`/api/users/${memberId}/tags/${tag.id}`).set(leader)).status,
    ).toBe(404);
    expect((await assign('ck0000000000000000000none', tag.id)).status).toBe(404);
    expect((await assign(memberId, 'ck0000000000000000000none')).status).toBe(404);

    const events = await prisma.auditEvent.findMany({
      where: { action: { in: ['tag_assigned', 'tag_unassigned'] } },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => [e.action, e.targetType, e.targetId, e.metadata])).toEqual([
      ['tag_assigned', 'user', memberId, { tagId: tag.id, tagName: 'Greeter' }],
      ['tag_unassigned', 'user', memberId, { tagId: tag.id, tagName: 'Greeter' }],
    ]);
  });

  it('lets only admins delete a tag, which removes its assignments and records how many', async () => {
    const tag = (await create({ name: 'Old list' })).body.tag;
    await assign(memberId, tag.id);
    await assign(otherId, tag.id);
    expect((await request(app).delete(`/api/tags/${tag.id}`).set(leader)).status).toBe(403);
    const res = await request(app).delete(`/api/tags/${tag.id}`).set(admin);
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(2);
    expect(await prisma.userTag.count({ where: { tagId: tag.id } })).toBe(0);
    const event = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'tag_deleted' } });
    expect(event).toMatchObject({ targetId: tag.id, count: 2, metadata: { name: 'Old list' } });
    expect((await request(app).delete(`/api/tags/${tag.id}`).set(admin)).status).toBe(404);
  });

  it('writes nothing when the audit write fails', async () => {
    vi.mocked(audit).mockRejectedValueOnce(new Error('audit write failed'));
    expect((await create({ name: 'Ghost' })).status).toBe(500);
    expect(await prisma.memberTag.count()).toBe(0);

    const tag = (await create({ name: 'Real' })).body.tag;
    vi.mocked(audit).mockRejectedValueOnce(new Error('audit write failed'));
    expect((await assign(memberId, tag.id)).status).toBe(500);
    expect(await prisma.userTag.count()).toBe(0);

    await assign(memberId, tag.id);
    vi.mocked(audit).mockRejectedValueOnce(new Error('audit write failed'));
    expect((await request(app).delete(`/api/tags/${tag.id}`).set(admin)).status).toBe(500);
    expect(await prisma.userTag.count()).toBe(1);
    expect(await auditActions()).toEqual(['tag_created', 'tag_assigned']);
  });

  describe('members never receive tags (P5-D12)', () => {
    let tagId: string;
    beforeEach(async () => {
      tagId = (await create({ name: 'Needs follow-up' })).body.tag.id;
      await assign(memberId, tagId);
      await assign(otherId, tagId);
    });

    it('are refused every tag route', async () => {
      expect((await request(app).get('/api/tags').set(member)).status).toBe(403);
      expect((await create({ name: 'Mine' }, member)).status).toBe(403);
      expect(
        (await request(app).patch(`/api/tags/${tagId}`).set(member).send({ name: 'x' })).status,
      ).toBe(403);
      expect((await assign(memberId, tagId, member)).status).toBe(403);
      expect(
        (await request(app).delete(`/api/users/${memberId}/tags/${tagId}`).set(member)).status,
      ).toBe(403);
      expect(await prisma.userTag.count()).toBe(2);
    });

    it('get no tags in the directory, their own profile, their edits or /auth/me', async () => {
      const responses = [
        await request(app).get('/api/users').set(member),
        await request(app).get(`/api/users/${memberId}`).set(member),
        await request(app).get(`/api/users/${otherId}`).set(member),
        await request(app).put(`/api/users/${memberId}`).set(member).send({ bio: 'Hello' }),
        await request(app).get('/api/auth/me').set(member),
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'tags-member@tags.test.local', password: 'correct-horse-battery' }),
      ];
      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).not.toMatch(/memberTags|Needs follow-up/);
      }
    });

    it('while staff get them on list, search and profile rows', async () => {
      const list = await request(app).get('/api/users?q=tags-other').set(leader);
      expect(list.body.users[0].memberTags).toEqual([
        { tag: { id: tagId, name: 'Needs follow-up', color: '#3B82F6', isActive: true } },
      ]);
      const search = await request(app)
        .post('/api/users/search')
        .set(leader)
        .send({
          conditions: [{ field: 'name', operator: 'equals', value: 'Other' }],
          logic: 'AND',
        });
      expect(search.body.users[0].memberTags).toHaveLength(1);
      const own = await request(app).get(`/api/users/${leaderId}`).set(leader);
      expect(own.body.user.memberTags).toEqual([]);
    });
  });
});
