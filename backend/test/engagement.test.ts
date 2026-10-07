import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { MembershipStage, RiskLevel, ServiceType } from '@embrace/shared';
import { app, bearer, createUser, login, resetDatabase } from './helpers';
import { prisma } from '../src/lib/prisma';
import {
  determineRisk,
  determineStage,
  type EngagementFacts,
  getEngagementTrends,
  getMemberAnalytics,
  scoreEngagement,
  updateMemberEngagement,
} from '../src/modules/analytics/service';
import {
  engagementRefreshIdle,
  runEngagementRefresh,
  startEngagementRefresh,
  waitForEngagementRefresh,
} from '../src/modules/analytics/jobs';

// Engagement, stage and risk (PHASE3_SPECS.md 1.5): the score arithmetic, every stage rule with a
// seeded fixture that triggers it, the risk rules, snapshots and trends, the refresh-all job and
// its CLI entry point.

// A fixed clock: Monday 5 October 2026. Sunday services are held 1, 8, 15, ... days before it.
const NOW = new Date('2026-10-05T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const daysBefore = (n: number) => new Date(NOW.getTime() - n * DAY);
const dayOf = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
/** The UTC day of the k-th Sunday service before NOW (k = 0 is the day before). */
const sunday = (k: number) => dayOf(daysBefore(1 + 7 * k));
const WEEKS_OF_SERVICES = 30;
const LONG_AGO = daysBefore(800);

const facts = (overrides: Partial<EngagementFacts> = {}): EngagementFacts => ({
  isActive: true,
  hasLeaderRole: false,
  membershipDate: LONG_AGO,
  scoringServices: 0,
  attendedScoring: 0,
  recentScoringServices: 0,
  recentAttendedScoring: 0,
  lapsedWindowScoringServices: 0,
  attendedRecent: 0,
  attendedEarlier: 0,
  attendedEver: 0,
  activeGroups: 0,
  ministryActivities: 0,
  twoWayInteractions: 0,
  respondedInteractions: 0,
  ...overrides,
});

describe('engagement score arithmetic', () => {
  it.each([
    {
      name: 'nothing recorded: communication is neutral (50)',
      input: facts(),
      expected: {
        attendanceScore: 0,
        communityScore: 0,
        communicationScore: 50,
        engagementScore: 10,
      },
    },
    {
      name: '9 of 12 services, one group, 1 of 4 answered',
      input: facts({
        scoringServices: 12,
        attendedScoring: 9,
        activeGroups: 1,
        twoWayInteractions: 4,
        respondedInteractions: 1,
      }),
      // 0.6 * 75 + 0.2 * 60 + 0.2 * 25 = 62
      expected: {
        attendanceScore: 75,
        communityScore: 60,
        communicationScore: 25,
        engagementScore: 62,
      },
    },
    {
      name: '3 of 7 services, three groups, 2 of 3 answered (components rounded first)',
      input: facts({
        scoringServices: 7,
        attendedScoring: 3,
        activeGroups: 3,
        twoWayInteractions: 3,
        respondedInteractions: 2,
      }),
      // 43 (42.86), 100, 67 (66.67): 0.6 * 43 + 0.2 * 100 + 0.2 * 67 = 59.2
      expected: {
        attendanceScore: 43,
        communityScore: 100,
        communicationScore: 67,
        engagementScore: 59,
      },
    },
    {
      // Components are rounded first and engagementScore weights the rounded components:
      // attendance 14 (14.29), 0.6 * 14 + 0.2 * 50 = 18.4 -> 18 (the raw ratio would give 19).
      name: '1 of 7 services, nothing else (engagementScore from the rounded components)',
      input: facts({ scoringServices: 7, attendedScoring: 1 }),
      expected: {
        attendanceScore: 14,
        communityScore: 0,
        communicationScore: 50,
        engagementScore: 18,
      },
    },
    {
      name: 'responses without a logged ask: communication 100',
      input: facts({ twoWayInteractions: 0, respondedInteractions: 1 }),
      expected: {
        attendanceScore: 0,
        communityScore: 0,
        communicationScore: 100,
        engagementScore: 20,
      },
    },
    {
      name: 'more responses than asks: communication capped at 100',
      input: facts({ twoWayInteractions: 1, respondedInteractions: 3 }),
      expected: {
        attendanceScore: 0,
        communityScore: 0,
        communicationScore: 100,
        engagementScore: 20,
      },
    },
    {
      name: 'every service, two groups, every message answered',
      input: facts({
        scoringServices: 12,
        attendedScoring: 12,
        activeGroups: 2,
        twoWayInteractions: 2,
        respondedInteractions: 2,
      }),
      expected: {
        attendanceScore: 100,
        communityScore: 100,
        communicationScore: 100,
        engagementScore: 100,
      },
    },
  ])('$name', ({ input, expected }) => {
    expect(scoreEngagement(input)).toEqual(expected);
  });
});

describe('risk rules', () => {
  it.each<{ name: string; stage: MembershipStage; input: EngagementFacts; risk: RiskLevel }>([
    { name: 'at_risk is high', stage: 'at_risk', input: facts(), risk: 'high' },
    { name: 'inactive is high', stage: 'inactive', input: facts(), risk: 'high' },
    { name: 'visitor is medium', stage: 'visitor', input: facts(), risk: 'medium' },
    {
      name: 'below 25% of recent services is medium',
      stage: 'core_member',
      input: facts({ recentScoringServices: 8, recentAttendedScoring: 1 }),
      risk: 'medium',
    },
    {
      name: 'exactly 25% is low',
      stage: 'active_member',
      input: facts({ recentScoringServices: 8, recentAttendedScoring: 2 }),
      risk: 'low',
    },
    {
      name: 'no recent services is low',
      stage: 'active_member',
      input: facts(),
      risk: 'low',
    },
  ])('$name', ({ stage, input, risk }) => {
    expect(determineRisk(stage, input)).toBe(risk);
  });

  it('applies the stage rules in order', () => {
    // A leader who has lapsed is still a leader; an inactive account is inactive before at_risk.
    expect(determineStage(facts({ hasLeaderRole: true, isActive: false }), NOW)).toBe('leader');
    expect(determineStage(facts({ isActive: false, attendedEarlier: 3 }), NOW)).toBe('inactive');
    // at_risk wins over visitor and new_member.
    expect(
      determineStage(facts({ membershipDate: null, attendedEarlier: 1, attendedEver: 1 }), NOW),
    ).toBe('at_risk');
  });
});

// Each case seeds one member and expects the stage and risk after a refresh at NOW.
type Seed = {
  role?: 'member' | 'leader' | 'admin';
  isActive?: boolean;
  membershipDate?: Date | null;
  createdAt?: Date;
  /** Sunday services attended, by k (see `sunday`). */
  sundays?: number[];
  /** Bible studies attended, days before NOW (services are created on demand). */
  bibleStudies?: number[];
  /** Sunday services attended that are dated this many days after NOW. */
  futureServices?: number[];
  groups?: Array<{ active: boolean; groupActive?: boolean }>;
  activities?: Array<{
    type: 'volunteer' | 'ministry_participation' | 'donation';
    daysAgo: number;
  }>;
};
type StageCase = {
  rule: string;
  seed: Seed;
  stage: MembershipStage;
  risk: RiskLevel;
  scores?: Partial<Record<'attendanceScore' | 'communityScore' | 'engagementScore', number>>;
};

const ALL_TWELVE = Array.from({ length: 12 }, (_, k) => k);
const STAGE_CASES: StageCase[] = [
  {
    rule: 'leader: holds the leader role',
    seed: { role: 'leader' },
    stage: 'leader',
    risk: 'medium',
  },
  {
    rule: 'leader: holds the admin role, attends every week',
    seed: { role: 'admin', sundays: ALL_TWELVE },
    stage: 'leader',
    risk: 'low',
  },
  {
    rule: 'inactive: the account is deactivated',
    seed: { isActive: false, sundays: ALL_TWELVE },
    stage: 'inactive',
    risk: 'high',
  },
  {
    rule: 'inactive: no attendance in 26 weeks while services were held',
    seed: { sundays: [27] },
    stage: 'inactive',
    risk: 'high',
  },
  {
    rule: 'at_risk: attended in weeks 9 to 26, not in the last 8',
    seed: { sundays: [10, 14] },
    stage: 'at_risk',
    risk: 'high',
  },
  {
    rule: 'visitor: no membership date, fewer than 3 attendances ever',
    seed: { membershipDate: null, sundays: [0, 1] },
    stage: 'visitor',
    risk: 'medium',
  },
  {
    rule: 'visitor: created today, services held only before today',
    seed: { membershipDate: null, createdAt: daysBefore(0) },
    stage: 'visitor',
    risk: 'medium',
    scores: { attendanceScore: 0 },
  },
  {
    rule: 'visitor: a service dated after today does not count towards 3 attendances ever',
    seed: { membershipDate: null, sundays: [0, 1], futureServices: [6] },
    stage: 'visitor',
    risk: 'medium',
  },
  {
    rule: 'inactive: created yesterday, a scoring service held since, never attended',
    seed: { createdAt: daysBefore(1), groups: [{ active: true }] },
    stage: 'inactive',
    risk: 'high',
  },
  {
    rule: 'core_member, low risk: created today with an old membership, services only before today',
    seed: { createdAt: daysBefore(0), groups: [{ active: true }] },
    stage: 'core_member',
    risk: 'low',
    // No scoring service counts for the account: the 8-week rate rule does not apply.
    scores: { attendanceScore: 0 },
  },
  {
    rule: 'active_member: services before the account was created do not count against it',
    // Created 16 days ago: 3 Sundays held since, 1 attended (without the clamp: 1 of 12).
    seed: { createdAt: daysBefore(16), sundays: [0] },
    stage: 'active_member',
    risk: 'low',
    scores: { attendanceScore: 33 },
  },
  {
    rule: 'active_member: an attended service from before the account was created counts',
    // 3 Sundays held since creation plus the attended one before it: 2 of 4.
    seed: { createdAt: daysBefore(16), sundays: [0, 5] },
    stage: 'active_member',
    risk: 'low',
    scores: { attendanceScore: 50 },
  },
  {
    rule: 'new_member: membership date within 6 months',
    seed: { membershipDate: daysBefore(60), sundays: [0, 1, 2, 3] },
    stage: 'new_member',
    risk: 'low',
  },
  {
    rule: 'core_member: an active group membership',
    seed: { sundays: ALL_TWELVE, groups: [{ active: true }] },
    stage: 'core_member',
    risk: 'low',
    scores: { attendanceScore: 100, communityScore: 60, engagementScore: 82 },
  },
  {
    rule: 'core_member: a ministry activity in the last 12 months',
    seed: { sundays: [0, 1, 2], activities: [{ type: 'ministry_participation', daysAgo: 90 }] },
    stage: 'core_member',
    risk: 'low',
  },
  {
    rule: 'core_member: a volunteer activity in the last 12 months',
    seed: { sundays: [0, 1, 2], activities: [{ type: 'volunteer', daysAgo: 300 }] },
    stage: 'core_member',
    risk: 'low',
  },
  {
    rule: 'active_member: attends, no group or ministry (old and non-ministry activity ignored)',
    seed: {
      sundays: ALL_TWELVE,
      groups: [{ active: false }, { active: true, groupActive: false }],
      activities: [
        { type: 'volunteer', daysAgo: 400 },
        { type: 'donation', daysAgo: 10 },
      ],
    },
    stage: 'active_member',
    risk: 'low',
    // 0.6 * 100 + 0.2 * 0 + 0.2 * 50
    scores: { attendanceScore: 100, communityScore: 0, engagementScore: 70 },
  },
  {
    rule: 'active_member: no membership date but 3 attendances',
    seed: { membershipDate: null, sundays: [0, 1, 2] },
    stage: 'active_member',
    risk: 'low',
    scores: { attendanceScore: 25 },
  },
  {
    rule: 'active_member with medium risk: 1 of the last 8 services',
    seed: { sundays: [0, 8, 9, 10, 11] },
    stage: 'active_member',
    risk: 'medium',
    scores: { attendanceScore: 42 },
  },
  {
    rule: 'any service type counts as attendance for the lapse rules (not for the score)',
    seed: { bibleStudies: [3] },
    stage: 'active_member',
    risk: 'medium',
    scores: { attendanceScore: 0 },
  },
];

const PREFIX = 'engagement-';
let staff: string;

async function serviceId(date: Date, type: ServiceType) {
  const service = await prisma.service.upsert({
    where: { date_type: { date, type } },
    update: {},
    create: { date, type },
  });
  return service.id;
}

async function seedMember(email: string, seed: Seed): Promise<string> {
  const user = await createUser({
    email,
    role: seed.role ?? 'member',
    isActive: seed.isActive ?? true,
  });
  await prisma.user.update({
    where: { id: user.id },
    data: {
      createdAt: seed.createdAt ?? LONG_AGO,
      membershipDate: seed.membershipDate === undefined ? LONG_AGO : seed.membershipDate,
    },
  });
  for (const k of seed.sundays ?? [])
    await prisma.attendance.create({
      data: { userId: user.id, serviceId: await serviceId(sunday(k), 'sunday_service') },
    });
  for (const d of seed.futureServices ?? [])
    await prisma.attendance.create({
      data: {
        userId: user.id,
        serviceId: await serviceId(dayOf(daysBefore(-d)), 'sunday_service'),
      },
    });
  for (const d of seed.bibleStudies ?? [])
    await prisma.attendance.create({
      data: { userId: user.id, serviceId: await serviceId(dayOf(daysBefore(d)), 'bible_study') },
    });
  for (const [i, g] of (seed.groups ?? []).entries()) {
    const group = await prisma.group.create({
      data: {
        name: `${PREFIX}${email}-${i}`,
        type: 'small_group',
        isActive: g.groupActive ?? true,
      },
    });
    await prisma.groupMember.create({
      data: { userId: user.id, groupId: group.id, isActive: g.active },
    });
  }
  for (const a of seed.activities ?? [])
    await prisma.memberActivity.create({
      data: { userId: user.id, activityType: a.type, createdAt: daysBefore(a.daysAgo) },
    });
  return user.id;
}

describe('engagement refresh', () => {
  const ids = new Map<string, string>();

  beforeAll(async () => {
    await resetDatabase();
    await prisma.group.deleteMany({ where: { name: { startsWith: PREFIX } } });
    for (let k = 0; k < WEEKS_OF_SERVICES; k++) await serviceId(sunday(k), 'sunday_service');
    // A service of another type in the scoring window does not change the denominator.
    await serviceId(dayOf(daysBefore(5)), 'prayer_meeting');
    await createUser({ email: `${PREFIX}staff@engagement.test.local`, role: 'leader' });
    staff = await login(`${PREFIX}staff@engagement.test.local`);
    for (const [i, c] of STAGE_CASES.entries())
      ids.set(c.rule, await seedMember(`${PREFIX}case${i}@engagement.test.local`, c.seed));
  });

  afterAll(async () => {
    await engagementRefreshIdle();
    await prisma.group.deleteMany({ where: { name: { startsWith: PREFIX } } });
  });

  it.each(STAGE_CASES)('$rule -> $stage / $risk', async (c) => {
    const userId = ids.get(c.rule)!;
    await updateMemberEngagement(userId, NOW);
    const row = await prisma.memberEngagement.findUniqueOrThrow({ where: { userId } });
    expect({ stage: row.membershipStage, risk: row.riskLevel }).toEqual({
      stage: c.stage,
      risk: c.risk,
    });
    if (c.scores) expect(row).toMatchObject(c.scores);
    expect(row.lastCalculated).toEqual(NOW);
  });

  it('enumerates every membership stage', () => {
    expect(new Set(STAGE_CASES.map((c) => c.stage))).toEqual(
      new Set([
        'leader',
        'inactive',
        'at_risk',
        'visitor',
        'new_member',
        'core_member',
        'active_member',
      ]),
    );
  });

  it.each<{
    name: string;
    data: Array<{ interactionType: 'sms_sent' | 'sms_replied' | 'email_sent' | 'email_opened' }>;
    score: number;
  }>([
    {
      name: 'sms_sent and its sms_replied',
      data: [{ interactionType: 'sms_sent' }, { interactionType: 'sms_replied' }],
      score: 100,
    },
    {
      name: 'two sms_sent, one sms_replied',
      data: [
        { interactionType: 'sms_sent' },
        { interactionType: 'sms_sent' },
        { interactionType: 'sms_replied' },
      ],
      score: 50,
    },
    { name: 'nothing logged', data: [], score: 50 },
    { name: 'only an email_opened', data: [{ interactionType: 'email_opened' }], score: 100 },
  ])('communication: $name -> $score', async ({ name, data, score }) => {
    const userId = await seedMember(
      `${PREFIX}talk-${name.replace(/\W+/g, '-')}@engagement.test.local`,
      {},
    );
    await prisma.memberInteraction.createMany({
      data: data.map((d) => ({
        userId,
        ...d,
        channel: d.interactionType.startsWith('sms') ? ('sms' as const) : ('email' as const),
        createdAt: daysBefore(20),
      })),
    });
    await updateMemberEngagement(userId, NOW);
    const row = await prisma.memberEngagement.findUniqueOrThrow({ where: { userId } });
    expect(row.communicationScore).toBe(score);
  });

  it('scores communication as responses over asks in the last 12 months', async () => {
    const userId = await seedMember(`${PREFIX}talk@engagement.test.local`, {
      sundays: ALL_TWELVE,
      groups: [{ active: true }, { active: true }],
    });
    const at = daysBefore(20);
    await prisma.memberInteraction.createMany({
      data: [
        { userId, interactionType: 'email_sent', channel: 'email', createdAt: at },
        { userId, interactionType: 'sms_replied', channel: 'sms', createdAt: at },
        {
          userId,
          interactionType: 'call_made',
          channel: 'phone',
          responseRequired: true,
          responseReceived: true,
          createdAt: at,
        },
        // Not an ask, and outside the window: neither counts.
        { userId, interactionType: 'visit_logged', channel: 'in_person', createdAt: at },
        { userId, interactionType: 'email_sent', channel: 'email', createdAt: daysBefore(400) },
      ],
    });
    await updateMemberEngagement(userId, NOW);
    const row = await prisma.memberEngagement.findUniqueOrThrow({ where: { userId } });
    // Asks: email_sent and the call marked responseRequired. Responses: the sms_replied row and
    // the answered call. 2 of 2 -> 100; 0.6 * 100 + 0.2 * 100 + 0.2 * 100 = 100
    expect(row).toMatchObject({
      attendanceScore: 100,
      communityScore: 100,
      communicationScore: 100,
      engagementScore: 100,
      servicesAttended: 12,
    });
  });

  it('takes lastActivity from the latest of attendance, interactions, activities and login', async () => {
    const userId = await seedMember(`${PREFIX}last@engagement.test.local`, { sundays: [3] });
    await prisma.memberActivity.create({
      data: { userId, activityType: 'donation', createdAt: daysBefore(40) },
    });
    await updateMemberEngagement(userId, NOW);
    let row = await prisma.memberEngagement.findUniqueOrThrow({ where: { userId } });
    expect(row.lastActivity).toEqual(sunday(3));

    await prisma.memberInteraction.create({
      data: {
        userId,
        interactionType: 'note_added',
        channel: 'in_person',
        createdAt: daysBefore(2),
      },
    });
    await updateMemberEngagement(userId, NOW);
    row = await prisma.memberEngagement.findUniqueOrThrow({ where: { userId } });
    expect(row.lastActivity).toEqual(daysBefore(2));

    const login = daysBefore(0.5);
    await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: login } });
    await updateMemberEngagement(userId, NOW);
    row = await prisma.memberEngagement.findUniqueOrThrow({ where: { userId } });
    expect(row.lastActivity).toEqual(login);
  });

  it('keeps one snapshot per member and month, and trends read them oldest first', async () => {
    const userId = await seedMember(`${PREFIX}trend@engagement.test.local`, { sundays: [0] });
    const september = new Date('2026-09-20T12:00:00.000Z');
    await updateMemberEngagement(userId, september);
    await updateMemberEngagement(userId, NOW);
    await prisma.attendance.create({
      data: { userId, serviceId: await serviceId(sunday(1), 'sunday_service') },
    });
    await updateMemberEngagement(userId, NOW); // replaces October's snapshot

    const snapshots = await prisma.engagementSnapshot.findMany({
      where: { userId },
      orderBy: { month: 'asc' },
    });
    expect(snapshots.map((s) => s.month.toISOString().slice(0, 10))).toEqual([
      '2026-09-01',
      '2026-10-01',
    ]);
    expect(snapshots[1]!.attendanceScore).toBe(17); // 2 of 12

    const trends = await getEngagementTrends(userId, 2, NOW);
    expect(trends.map((t) => t.month)).toEqual(['2026-09', '2026-10']);
    expect(trends[1]).toMatchObject({
      attendanceScore: 17,
      membershipStage: 'active_member',
      riskLevel: 'low',
    });
    expect(await getEngagementTrends(userId, 1, NOW)).toHaveLength(1);
  });

  it('serves trends and a computed engagement with a chosen scoring set', async () => {
    // This test runs on the real clock: the bible study is 10 days before today.
    const userId = await seedMember(`${PREFIX}api@engagement.test.local`, {});
    await prisma.attendance.create({
      data: {
        userId,
        serviceId: await serviceId(dayOf(new Date(Date.now() - 10 * DAY)), 'bible_study'),
      },
    });
    await updateMemberEngagement(userId);
    const trends = await request(app)
      .get(`/api/analytics/members/${userId}/trends?months=3`)
      .set(bearer(staff));
    expect(trends.status).toBe(200);
    expect(trends.body.trends).toEqual([
      expect.objectContaining({ month: new Date().toISOString().slice(0, 7) }),
    ]);
    expect(
      (
        await request(app)
          .get(`/api/analytics/members/${userId}/trends?months=61`)
          .set(bearer(staff))
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .get('/api/analytics/members/cjld2cjxh0000qzrmn831i7rn/trends')
          .set(bearer(staff))
      ).status,
    ).toBe(404);

    const bible = await request(app)
      .get(`/api/analytics/members/${userId}/engagement?types=bible_study`)
      .set(bearer(staff));
    expect(bible.status).toBe(200);
    expect(bible.body.engagement).toMatchObject({ types: ['bible_study'] });
    expect(bible.body.engagement.attendanceScore).toBeGreaterThan(0);
    expect(
      (
        await request(app)
          .get(`/api/analytics/members/${userId}/engagement?types=football`)
          .set(bearer(staff))
      ).status,
    ).toBe(400);
  });

  it('computes the dashboard totals over active accounts from the stored rows', async () => {
    const analytics = await getMemberAnalytics();
    const engagements = await prisma.memberEngagement.findMany({
      where: { user: { isActive: true } },
    });
    expect(analytics.totalMembers).toBe(await prisma.user.count({ where: { isActive: true } }));
    expect(Object.keys(analytics.membershipStageDistribution).sort()).toEqual(
      [
        'active_member',
        'at_risk',
        'core_member',
        'inactive',
        'leader',
        'new_member',
        'visitor',
      ].sort(),
    );
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum(analytics.membershipStageDistribution)).toBe(engagements.length);
    expect(sum(analytics.riskLevelDistribution)).toBe(engagements.length);
    expect(analytics.atRiskMembers).toBe(engagements.filter((e) => e.riskLevel === 'high').length);
    const mean = (k: 'attendanceScore' | 'engagementScore') =>
      Math.round(engagements.reduce((a, e) => a + e[k], 0) / engagements.length);
    expect(analytics.averageScores).toMatchObject({
      attendanceScore: mean('attendanceScore'),
      engagementScore: mean('engagementScore'),
    });
    expect(analytics.averageEngagementScore).toBe(mean('engagementScore'));
    expect(analytics.topEngagedMembers[0]!.engagementScore).toBe(
      Math.max(...engagements.map((e) => e.engagementScore)),
    );
    expect(analytics.topEngagedMembers[0]).not.toHaveProperty('givingScore');
  });

  it('counts new members from the first day of the UTC month, whatever the server time zone', async () => {
    const tz = process.env.TZ;
    // 31 October 12:00 UTC is already 1 November in this zone (UTC+14).
    process.env.TZ = 'Pacific/Kiritimati';
    try {
      await prisma.user.update({
        where: { email: `${PREFIX}staff@engagement.test.local` },
        data: { createdAt: new Date('2026-10-15T12:00:00.000Z') },
      });
      const analytics = await getMemberAnalytics(new Date('2026-10-31T12:00:00.000Z'));
      const expected = await prisma.user.count({
        where: { isActive: true, createdAt: { gte: new Date('2026-10-01T00:00:00.000Z') } },
      });
      expect(expected).toBeGreaterThan(0);
      expect(analytics.newMembersThisMonth).toBe(expected);
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });
});

describe('refresh-all job', () => {
  beforeAll(async () => {
    await resetDatabase();
    await createUser({ email: `${PREFIX}job-staff@engagement.test.local`, role: 'leader' });
    for (let i = 0; i < 7; i++)
      await createUser({ email: `${PREFIX}job${i}@engagement.test.local`, role: 'member' });
    await createUser({
      email: `${PREFIX}job-off@engagement.test.local`,
      role: 'member',
      isActive: false,
    });
    staff = await login(`${PREFIX}job-staff@engagement.test.local`);
  });

  afterAll(() => engagementRefreshIdle());

  it('responds 202 with a job id, and the job completes for every account', async () => {
    const res = await request(app)
      .post('/api/analytics/members/engagement/refresh-all')
      .set(bearer(staff));
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ success: true, status: 'running', jobId: expect.any(String) });

    await engagementRefreshIdle();
    const status = await request(app)
      .get(`/api/analytics/jobs/${res.body.jobId}`)
      .set(bearer(staff));
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      success: true,
      jobId: res.body.jobId,
      status: 'completed',
      processed: 9,
      failed: 0,
      total: 9,
      startedAt: expect.any(String),
      finishedAt: expect.any(String),
    });
    // Every account was refreshed, the deactivated one included, with a snapshot each.
    expect(await prisma.engagementSnapshot.count()).toBe(9);
    const off = await prisma.memberEngagement.findFirstOrThrow({
      where: { user: { email: `${PREFIX}job-off@engagement.test.local` } },
    });
    expect(off).toMatchObject({ membershipStage: 'inactive', riskLevel: 'high' });
  });

  it('does not start a second job while one is running, and re-running changes nothing', async () => {
    const first = startEngagementRefresh();
    const second = startEngagementRefresh();
    expect(first.started).toBe(true);
    expect(second).toEqual({ job: first.job, started: false });
    await engagementRefreshIdle();
    const before = await prisma.memberEngagement.findMany({ orderBy: { userId: 'asc' } });

    const again = await runEngagementRefresh(undefined, 2);
    expect(again).toMatchObject({ status: 'completed', processed: 9, failed: 0, total: 9 });
    const after = await prisma.memberEngagement.findMany({ orderBy: { userId: 'asc' } });
    const scores = (rows: typeof before) =>
      rows.map(({ lastCalculated: _l, updatedAt: _u, ...rest }) => rest);
    expect(scores(after)).toEqual(scores(before));
    expect(await prisma.engagementSnapshot.count()).toBe(9);
  });

  it('reports unknown and malformed job ids', async () => {
    const unknown = await request(app)
      .get('/api/analytics/jobs/7d444840-9dc0-11d1-b245-5ffdce74fad2')
      .set(bearer(staff));
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe('Job not found');
    expect((await request(app).get('/api/analytics/jobs/nope').set(bearer(staff))).status).toBe(
      400,
    );
  });

  it('runs from the command line and exits 0', async () => {
    await prisma.engagementSnapshot.deleteMany();
    const backend = resolve(__dirname, '..');
    execFileSync(
      process.execPath,
      ['--import', 'tsx', resolve(backend, 'src/jobs/refresh-engagement.ts')],
      { cwd: backend, env: process.env, stdio: 'pipe' },
    );
    expect(await prisma.engagementSnapshot.count()).toBe(9);
  });

  describe('failures', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('counts a member deleted while the job runs as skipped, not failed', async () => {
      const gone = await createUser({
        email: `${PREFIX}job-gone@engagement.test.local`,
        role: 'member',
      });
      const stale = await prisma.user.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
      await prisma.user.delete({ where: { id: gone.id } });
      vi.spyOn(prisma.user, 'findMany').mockResolvedValueOnce(stale as never);

      const job = await runEngagementRefresh();
      expect(job).toMatchObject({
        status: 'completed',
        processed: 10,
        failed: 0,
        skipped: 1,
        total: 10,
      });
    });

    it('marks the job failed when the member list cannot be read', async () => {
      vi.spyOn(prisma.user, 'findMany').mockRejectedValueOnce(new Error('database down'));
      const job = await runEngagementRefresh();
      expect(job.status).toBe('failed');
      expect(job.finishedAt).toBeInstanceOf(Date);
    });

    it('counts a member whose refresh throws in failed, completes, and the CLI exits 1', async () => {
      const broken = await createUser({
        email: `${PREFIX}job-broken@engagement.test.local`,
        role: 'member',
      });
      // A trigger that rejects this member's engagement row makes their refresh throw.
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION engagement_test_reject() RETURNS trigger AS $$
        BEGIN
          IF NEW."userId" = '${broken.id}' THEN RAISE EXCEPTION 'refresh rejected by test'; END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER engagement_test_reject BEFORE INSERT OR UPDATE ON member_engagement
        FOR EACH ROW EXECUTE FUNCTION engagement_test_reject()`);
      try {
        const job = await runEngagementRefresh();
        expect(job).toMatchObject({
          status: 'completed',
          processed: 10,
          failed: 1,
          skipped: 0,
          total: 10,
        });

        const backend = resolve(__dirname, '..');
        let exitCode = 0;
        try {
          execFileSync(
            process.execPath,
            ['--import', 'tsx', resolve(backend, 'src/jobs/refresh-engagement.ts')],
            { cwd: backend, env: process.env, stdio: 'pipe' },
          );
        } catch (err) {
          exitCode = (err as { status: number }).status;
        }
        expect(exitCode).toBe(1);
      } finally {
        await prisma.$executeRawUnsafe(
          'DROP TRIGGER IF EXISTS engagement_test_reject ON member_engagement',
        );
        await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS engagement_test_reject()');
      }
    });
  });

  it('lets shutdown wait for a running job, within a time limit', async () => {
    expect(await waitForEngagementRefresh(0)).toBe(true);
    startEngagementRefresh();
    expect(await waitForEngagementRefresh(0)).toBe(false);
    expect(await waitForEngagementRefresh(25_000)).toBe(true);
  });
});
