import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { app, bearer, createUser, login, resetDatabase } from './helpers';

// pg deprecates a query sent on a client that is already running one ("Calling client.query()
// when the client is already executing a query"). Inside a transaction Prisma loads a row's
// relations concurrently on the transaction's single connection, so the staff projection of a
// user (roles, tags, engagement) must be read outside any transaction. The warning is emitted
// once per process, and every test file runs in its own process.
const warnings: string[] = [];
const onWarning = (warning: Error) => {
  if (warning.message.includes('client.query()')) warnings.push(warning.message);
};

let admin: string;
let memberId: string;

beforeAll(async () => {
  process.on('warning', onWarning);
  await resetDatabase();
  await createUser({ email: 'admin@pg.test.local', role: 'admin' });
  memberId = (await createUser({ email: 'member@pg.test.local', role: 'member' })).id;
  admin = await login('admin@pg.test.local');
  const tag = await prisma.memberTag.create({ data: { name: 'Choir' } });
  await prisma.userTag.create({ data: { userId: memberId, tagId: tag.id } });
});

afterAll(() => {
  process.off('warning', onWarning);
});

describe('staff projection reads', () => {
  it('list, search, create and update issue no concurrent query on one connection', async () => {
    expect((await request(app).get('/api/users').set(bearer(admin))).status).toBe(200);
    const search = await request(app)
      .post('/api/users/search')
      .set(bearer(admin))
      .send({ conditions: [{ field: 'isActive', operator: 'equals', value: true }], logic: 'AND' });
    expect(search.status).toBe(200);
    const created = await request(app).post('/api/users').set(bearer(admin)).send({
      name: 'New Member',
      email: 'new@pg.test.local',
      password: 'correct-horse-battery-staple',
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.user).toMatchObject({ name: 'New Member', memberTags: [] });
    const updated = await request(app)
      .put(`/api/users/${memberId}`)
      .set(bearer(admin))
      .send({ name: 'Renamed', isActive: false });
    expect(updated.status).toBe(200);
    expect(updated.body.user).toMatchObject({ name: 'Renamed', isActive: false });
    expect(updated.body.user.memberTags).toHaveLength(1);
    // Warnings are delivered on the next tick.
    await new Promise((resolve) => setImmediate(resolve));
    expect(warnings).toEqual([]);
  });
});
