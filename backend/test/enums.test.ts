import { $Enums } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PRISMA_ENUMS } from '@embrace/shared';
import { prisma } from '../src/lib/prisma';
import { app, bearer, createUser, login, resetDatabase } from './helpers';

// @embrace/shared is the single source of enum lists (PHASE3_SPECS.md 0.3); the Prisma enums
// in schema.prisma must hold exactly the same values in the same order.
describe('shared enums match the Prisma enums', () => {
  it('declares the same enums', () => {
    expect(Object.keys(PRISMA_ENUMS).sort()).toEqual(Object.keys($Enums).sort());
  });

  it.each(Object.entries(PRISMA_ENUMS))('%s has the same values in order', (name, values) => {
    const prismaEnum = ($Enums as Record<string, Record<string, string>>)[name];
    expect(prismaEnum).toBeDefined();
    expect(Object.values(prismaEnum!)).toEqual([...values]);
  });
});

describe('enum columns', () => {
  let staff: { Authorization: string };
  let memberId: string;

  beforeAll(async () => {
    await resetDatabase();
    await createUser({ email: 'enum-staff@example.org', role: 'admin' });
    const member = await createUser({ email: 'enum-member@example.org', role: 'member' });
    memberId = member.id;
    staff = bearer(await login('enum-staff@example.org'));
  });

  afterAll(resetDatabase);

  it('rejects a milestone or activity type outside the enum with 400 VALIDATION', async () => {
    const milestone = await request(app)
      .post(`/api/member-details/${memberId}/milestones`)
      .set(staff)
      .send({ milestoneType: 'graduation', title: 'Graduated', achievedDate: '2026-05-01' });
    expect(milestone.status).toBe(400);
    expect(milestone.body.code).toBe('VALIDATION');
    expect(milestone.body.details.milestoneType).toBeDefined();

    const activity = await request(app)
      .post(`/api/analytics/members/${memberId}/activities`)
      .set(staff)
      .send({ activityType: 'group_participation', points: 1 });
    expect(activity.status).toBe(400);
    expect(activity.body.details.activityType).toBeDefined();
  });

  it('accepts every listed milestone type', async () => {
    for (const milestoneType of PRISMA_ENUMS.MilestoneType) {
      const res = await request(app)
        .post(`/api/member-details/${memberId}/milestones`)
        .set(staff)
        .send({ milestoneType, title: milestoneType, achievedDate: '2026-05-01' });
      expect(res.status).toBe(200);
    }
  });

  it('refuses an unknown value at the database too', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "member_engagement" SET "membershipStage" = 'champion' WHERE "userId" = $1`,
        memberId,
      ),
    ).rejects.toThrow(/invalid input value for enum/);
  });

  it('sorts membership stages in lifecycle order, not alphabetically', async () => {
    const stages = ['inactive', 'visitor', 'leader', 'new_member'] as const;
    for (const [i, stage] of stages.entries()) {
      const user = await createUser({ email: `enum-sort-${i}@example.org`, role: 'member' });
      await prisma.memberEngagement.upsert({
        where: { userId: user.id },
        update: { membershipStage: stage },
        create: { userId: user.id, membershipStage: stage },
      });
    }
    const res = await request(app)
      .get('/api/users?q=enum-sort&sort=membershipStage&order=asc')
      .set(staff);
    expect(res.status).toBe(200);
    expect(
      res.body.users.map(
        (u: { engagement: { membershipStage: string } }) => u.engagement.membershipStage,
      ),
    ).toEqual(['visitor', 'new_member', 'leader', 'inactive']);
  });
});
