import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { startOfUtcMonth, summary } from '../src/modules/users/service';
import { app, bearer, createUser, login, resetDatabase } from './helpers';

// GET /api/users/summary (PHASE2_SPECS 1.2, S4).
//
// Fixture, relative to the start of the current UTC month (M):
//   account        role    active  signed in  created
//   admin          admin   yes     yes        M - 40 days
//   leader         leader  yes     yes        M - 1 ms
//   member         member  yes     yes        now
//   newcomer       (registered through POST /api/auth/register, awaiting approval)    now
//   staffMade      member  no      never      M - 10 days  (inactive, never signed in: pending)
//   deactivated    member  no      yes        M - 5 days   (was approved, then deactivated)
// Staff: total 6, active 3, pendingApproval 2, newThisMonth 2. Members: total 3 (only).

const email = (name: string) => `${name}@summary.test.local`;
const DAY = 24 * 60 * 60 * 1000;

let adminToken: string;
let leaderToken: string;
let memberToken: string;

beforeAll(async () => {
  await resetDatabase();
  const monthStart = startOfUtcMonth(new Date()).getTime();
  const admin = await createUser({ email: email('admin'), role: 'admin' });
  const leader = await createUser({ email: email('leader'), role: 'leader' });
  await createUser({ email: email('member'), role: 'member' });
  const staffMade = await createUser({
    email: email('staffmade'),
    role: 'member',
    isActive: false,
  });
  const deactivated = await createUser({ email: email('deactivated'), role: 'member' });
  adminToken = await login(email('admin'));
  leaderToken = await login(email('leader'));
  memberToken = await login(email('member'));
  await login(email('deactivated'));
  const registered = await request(app)
    .post('/api/auth/register')
    .send({ email: email('newcomer'), password: 'a-long-new-passphrase', name: 'Newcomer' });
  expect(registered.status).toBe(201);

  await prisma.user.update({
    where: { id: admin.id },
    data: { createdAt: new Date(monthStart - 40 * DAY) },
  });
  await prisma.user.update({
    where: { id: leader.id },
    data: { createdAt: new Date(monthStart - 1) },
  });
  await prisma.user.update({
    where: { id: staffMade.id },
    data: { createdAt: new Date(monthStart - 10 * DAY) },
  });
  await prisma.user.update({
    where: { id: deactivated.id },
    data: { isActive: false, createdAt: new Date(monthStart - 5 * DAY) },
  });
});

const get = (token: string) => request(app).get('/api/users/summary').set(bearer(token));

describe('GET /api/users/summary', () => {
  it('gives staff (admin) every count', async () => {
    const res = await get(adminToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      total: 6,
      active: 3,
      pendingApproval: 2,
      newThisMonth: 2,
    });
  });

  it('gives staff (leader) the same counts', async () => {
    const res = await get(leaderToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      total: 6,
      active: 3,
      pendingApproval: 2,
      newThisMonth: 2,
    });
  });

  it('gives members only total, counted over the active directory', async () => {
    const res = await get(memberToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, total: 3 });
    expect(res.body).not.toHaveProperty('active');
    expect(res.body).not.toHaveProperty('pendingApproval');
    expect(res.body).not.toHaveProperty('newThisMonth');
  });

  it("matches the member directory's total", async () => {
    const directory = await request(app).get('/api/users').set(bearer(memberToken));
    expect(directory.status).toBe(200);
    expect((await get(memberToken)).body.total).toBe(directory.body.total);
  });

  it('ignores unknown query parameters', async () => {
    const res = await request(app)
      .get('/api/users/summary?pendingApproval=1&role=admin')
      .set(bearer(memberToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, total: 3 });
  });

  it('is not captured by GET /api/users/:id', async () => {
    const res = await get(adminToken);
    expect(res.body).not.toHaveProperty('user');
  });

  it('requires a session', async () => {
    expect((await request(app).get('/api/users/summary')).status).toBe(401);
  });

  it('approving a pending account moves it from pendingApproval to active', async () => {
    const newcomer = await prisma.user.findUniqueOrThrow({ where: { email: email('newcomer') } });
    const approved = await request(app)
      .put(`/api/users/${newcomer.id}`)
      .set(bearer(adminToken))
      .send({ isActive: true });
    expect(approved.status).toBe(200);
    expect((await get(adminToken)).body).toMatchObject({ active: 4, pendingApproval: 1 });
    expect((await get(memberToken)).body).toEqual({ success: true, total: 4 });
    await prisma.user.update({ where: { id: newcomer.id }, data: { isActive: false } });
  });
});

describe('summary month boundary', () => {
  it('startOfUtcMonth is midnight UTC on the first of the month', () => {
    expect(startOfUtcMonth(new Date('2026-10-04T12:34:56Z')).toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
    expect(startOfUtcMonth(new Date('2026-01-01T00:00:00Z')).toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    expect(startOfUtcMonth(new Date('2026-03-31T23:59:59.999Z')).toISOString()).toBe(
      '2026-03-01T00:00:00.000Z',
    );
  });

  it('the service returns only total for members', async () => {
    expect(await summary(false)).toEqual({ total: 3 });
  });

  it('counts newThisMonth from the start of the UTC month containing `now`', async () => {
    const monthStart = startOfUtcMonth(new Date());
    // From last month's point of view, everything created since its start counts.
    const lastMonth = new Date(monthStart.getTime() - 1);
    expect((await summary(true, lastMonth)).newThisMonth).toBe(5);
    // A month that starts after every account was created has no new accounts.
    const nextMonth = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 2),
    );
    expect((await summary(true, nextMonth)).newThisMonth).toBe(0);
  });
});
