import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import {
  app,
  backfillEngagementRows,
  bearer,
  createUser,
  ENGAGEMENT_BACKFILL_SQL,
  login,
  resetDatabase,
} from './helpers';

// Every account has a member_engagement row: registration, staff create and the seeded admin
// create one with the column defaults, and the data migration
// 20261005000000_engagement_rows_for_all_users backfilled the accounts created before.

const email = (name: string) => `${name}@engagement.test.local`;
const DEFAULTS = { engagementScore: 0, membershipStage: 'visitor', riskLevel: 'low' };

const rowOf = (address: string) =>
  prisma.memberEngagement.findFirst({ where: { user: { email: address } } });

beforeEach(resetDatabase);

describe('new accounts get an engagement row', () => {
  it('on registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: email('newcomer'), password: 'a-long-new-passphrase', name: 'Newcomer' });
    expect(res.status).toBe(201);
    expect(await rowOf(email('newcomer'))).toMatchObject(DEFAULTS);
  });

  it('on staff create', async () => {
    await createUser({ email: email('leader'), role: 'leader' });
    const token = await login(email('leader'));
    const res = await request(app)
      .post('/api/users')
      .set(bearer(token))
      .send({ name: 'Made', email: email('made'), password: 'a-long-new-passphrase' });
    expect(res.status).toBe(201);
    expect(res.body.user.engagement).toMatchObject(DEFAULTS);
    expect(await rowOf(email('made'))).toMatchObject(DEFAULTS);
  });

  it('for the seeded admin', () => {
    const backend = resolve(__dirname, '..');
    execFileSync('npx', ['tsx', 'prisma/seed.ts'], {
      cwd: backend,
      env: {
        ...process.env,
        SEED_ADMIN_EMAIL: email('seeded'),
        SEED_ADMIN_PASSWORD: 'a-long-seed-passphrase',
      },
      stdio: 'pipe',
    });
    return expect(rowOf(email('seeded'))).resolves.toMatchObject(DEFAULTS);
  }, 30_000);
});

describe('the engagement backfill migration', () => {
  it('is a single data-only statement', () => {
    expect(ENGAGEMENT_BACKFILL_SQL).toMatch(/INSERT INTO "member_engagement"/);
    expect(ENGAGEMENT_BACKFILL_SQL).not.toMatch(/\b(CREATE|ALTER|DROP)\b/);
  });

  it('adds a default row for every user lacking one and keeps existing rows', async () => {
    const scored = await createUser({ email: email('scored'), role: 'member' });
    const bare = await createUser({ email: email('bare'), role: 'member' });
    const inactive = await createUser({ email: email('off'), role: 'member', isActive: false });
    await prisma.memberEngagement.create({
      data: { userId: scored.id, engagementScore: 72, membershipStage: 'core_member' },
    });

    expect(await backfillEngagementRows()).toBe(2);

    const rows = await prisma.memberEngagement.findMany();
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.userId === scored.id)).toMatchObject({
      engagementScore: 72,
      membershipStage: 'core_member',
    });
    for (const id of [bare.id, inactive.id]) {
      const row = rows.find((r) => r.userId === id);
      expect(row).toMatchObject(DEFAULTS);
    }
    // Running it again changes nothing.
    expect(await backfillEngagementRows()).toBe(0);
  });
});
