import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import {
  DEFAULT_SCORING_SERVICE_TYPES,
  ENGAGEMENT_WEIGHTS,
  MEMBERSHIP_STAGES,
  RISK_LEVELS,
} from '@embrace/shared';
import type {
  ActivityType,
  EngagementComponents,
  EngagementTrend,
  InteractionType,
  MembershipStage,
  recordActivityInput,
  recordInteractionInput,
  RiskLevel,
  ServiceType,
} from '@embrace/shared';
import { prisma } from '../../lib/prisma';
import { HttpError } from '../../lib/http-error';
import { monthsBefore, today } from '../services/service';

// Engagement, stage and risk (PHASE3_SPECS.md 1.5). Everything is computed from recorded data:
// attendance at services (windowed by Service.date), group memberships, interactions and
// activities (by their createdAt). The rules are deterministic for a given `now`; the pure parts
// (scoreEngagement, determineStage, determineRisk) take the facts gathered by gatherFacts.
//
// Windows are whole UTC days ending today: "the last N weeks" is the 7N days up to and including
// today, "weeks 9 to 26" the days 56 to 181 before today, "12 months" starts on the same day 12
// calendar months ago. Services dated after today never count, in any window or in "ever".
//
// Account age: a scoring service held before the day the account was created never counts
// against the member (it counts only if they attended it). This applies to every windowed
// service count: the 12-week attendanceScore denominator, the 8-week medium risk rate and the
// 26-week inactive check.
//
// The refresh-all job (jobs.ts) refreshes every account, inactive ones included, and keeps the
// status of its last 20 jobs in memory, for the single API instance.

// Request metadata (a JSON object validated by the shared schema) as a Prisma JSON input.
const jsonOrUndefined = (value: Record<string, unknown> | undefined) =>
  value as Prisma.InputJsonObject | undefined;

export const RULES = {
  /** attendanceScore: attended / scoring services in this many weeks. */
  scoreWeeks: 12,
  /** at_risk and the medium risk rate look at this many recent weeks. */
  recentWeeks: 8,
  /** inactive: no attendance in this many weeks while there were scoring services. */
  lapsedWeeks: 26,
  /** communicationScore and the 12-month counters. */
  communicationMonths: 12,
  /** core_member: a volunteer or ministry activity within this many months. */
  ministryMonths: 12,
  /** new_member: membershipDate within this many months. */
  newMemberMonths: 6,
  /** visitor: no membershipDate and fewer attendances than this, ever. */
  visitorAttendances: 3,
  /** medium risk: recent attendance rate below this. */
  mediumRiskRate: 0.25,
  /** communicationScore when there were neither asks nor responses. */
  neutralCommunication: 50,
} as const;

// communicationScore = responses / asks over the last 12 months. Asks are the outbound messages
// (ASK_TYPES) plus any other interaction marked responseRequired. Responses are the reply rows
// (RESPONSE_TYPES, counted only as responses, never as asks) plus asks marked responseReceived or
// with a responseTime. So a logged sms_sent and its sms_replied score 100.
const ASK_TYPES: InteractionType[] = ['email_sent', 'sms_sent'];
const RESPONSE_TYPES: InteractionType[] = ['email_opened', 'sms_replied'];
const MINISTRY_ACTIVITIES: ActivityType[] = ['volunteer', 'ministry_participation'];

const DAY_MS = 24 * 60 * 60 * 1000;

/** What the rules read about one member. Attendance counts only rows marked present. */
export interface EngagementFacts {
  isActive: boolean;
  /** Holds the admin or leader role. */
  hasLeaderRole: boolean;
  membershipDate: Date | null;
  /**
   * Scoring services held in the last 12 weeks that count for the member (held on or after the
   * day the account was created, or attended), and how many of them the member attended.
   */
  scoringServices: number;
  attendedScoring: number;
  /** The same for the last 8 weeks (the medium risk rate). */
  recentScoringServices: number;
  recentAttendedScoring: number;
  /** The same count for the last 26 weeks (the inactive rule). */
  lapsedWindowScoringServices: number;
  /** Attendance at services of any type up to today: last 8 weeks, weeks 9 to 26, and ever. */
  attendedRecent: number;
  attendedEarlier: number;
  attendedEver: number;
  /** Active memberships of active groups. */
  activeGroups: number;
  /** volunteer or ministry_participation activities in the last 12 months. */
  ministryActivities: number;
  /** Asks (messages expecting an answer) and responses in the last 12 months. */
  twoWayInteractions: number;
  respondedInteractions: number;
}

const percent = (part: number, whole: number) => Math.round(Math.min(part / whole, 1) * 100);

/**
 * The three components (0-100, whole numbers) and their weighted sum. Each component is rounded
 * first and engagementScore weights the rounded components, so it can be reproduced from the
 * components the UI shows (1 of 7 services: attendance 14, engagement round(18.4) = 18, not the
 * 19 the unrounded ratio would give).
 */
export function scoreEngagement(facts: EngagementFacts): EngagementComponents {
  const attendanceScore =
    facts.scoringServices > 0 ? percent(facts.attendedScoring, facts.scoringServices) : 0;
  // Community: active memberships of active groups only (inactive memberships or groups do not
  // count); the core_member rule reads the same count.
  const communityScore = facts.activeGroups === 0 ? 0 : facts.activeGroups === 1 ? 60 : 100;
  const asks = facts.twoWayInteractions;
  const responses = facts.respondedInteractions;
  const communicationScore =
    asks > 0 ? percent(responses, asks) : responses > 0 ? 100 : RULES.neutralCommunication;
  const engagementScore = Math.round(
    ENGAGEMENT_WEIGHTS.attendance * attendanceScore +
      ENGAGEMENT_WEIGHTS.community * communityScore +
      ENGAGEMENT_WEIGHTS.communication * communicationScore,
  );
  return { engagementScore, attendanceScore, communityScore, communicationScore };
}

/** The first rule that matches, in the order of PHASE3_SPECS.md 1.5. */
export function determineStage(facts: EngagementFacts, now = new Date()): MembershipStage {
  if (facts.hasLeaderRole) return 'leader';
  // The presence checks (inactive, at_risk, visitor) count attendance at a service of any type;
  // only the rates (attendanceScore, the medium risk rate) use the scoring set.
  const attended26 = facts.attendedRecent + facts.attendedEarlier;
  if (!facts.isActive || (attended26 === 0 && facts.lapsedWindowScoringServices > 0))
    return 'inactive';
  if (facts.attendedEarlier > 0 && facts.attendedRecent === 0) return 'at_risk';
  if (!facts.membershipDate && facts.attendedEver < RULES.visitorAttendances) return 'visitor';
  if (
    facts.membershipDate &&
    facts.membershipDate.getTime() >= monthsBefore(today(now), RULES.newMemberMonths).getTime()
  )
    return 'new_member';
  if (facts.activeGroups > 0 || facts.ministryActivities > 0) return 'core_member';
  return 'active_member';
}

export function determineRisk(stage: MembershipStage, facts: EngagementFacts): RiskLevel {
  if (stage === 'at_risk' || stage === 'inactive') return 'high';
  // With no scoring service in the last 8 weeks (that counts for the member) the rate rule does
  // not apply.
  const lowRecentRate =
    facts.recentScoringServices > 0 &&
    facts.recentAttendedScoring / facts.recentScoringServices < RULES.mediumRiskRate;
  if (lowRecentRate || stage === 'visitor') return 'medium';
  return 'low';
}

interface Gathered {
  facts: EngagementFacts;
  lastActivity: Date | null;
  servicesAttended: number;
  eventsAttended: number;
}

/** The windows of the rules for a given `now` (whole UTC days ending today). */
function windowsAt(now: Date) {
  const day = today(now);
  const daysBefore = (n: number) => new Date(day.getTime() - n * DAY_MS);
  return {
    day,
    daysBefore,
    /** First day of "the last N weeks". */
    weeksStart: (weeks: number) => daysBefore(weeks * 7 - 1),
    twelveMonths: monthsBefore(day, RULES.communicationMonths),
  };
}

/**
 * What the rules need that is the same for every member: the scoring services held in the last
 * 26 weeks (the longest service window), up to and including today. A refresh-all job reads it
 * once and passes it to every member's refresh.
 */
export interface ScoringContext {
  now: Date;
  types: ServiceType[];
  services: Array<{ id: string; date: Date }>;
}

export async function loadScoringContext(
  types: readonly ServiceType[] = DEFAULT_SCORING_SERVICE_TYPES,
  now = new Date(),
): Promise<ScoringContext> {
  const { day, weeksStart } = windowsAt(now);
  const services = await prisma.service.findMany({
    where: { date: { gte: weeksStart(RULES.lapsedWeeks), lte: day }, type: { in: [...types] } },
    select: { id: true, date: true },
  });
  return { now, types: [...types], services };
}

/** Reads the facts for one member. Throws Prisma P2025 (404) for an unknown member. */
async function gatherFacts(userId: string, context: ScoringContext): Promise<Gathered> {
  const { day, daysBefore, weeksStart, twelveMonths } = windowsAt(context.now);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      isActive: true,
      membershipDate: true,
      createdAt: true,
      lastLoginAt: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  const present = (service?: Prisma.ServiceWhereInput): Prisma.AttendanceWhereInput => ({
    userId,
    present: true,
    ...(service ? { service } : {}),
  });
  const interactionWindow = { userId, createdAt: { gte: twelveMonths } };
  const asks: Prisma.MemberInteractionWhereInput = {
    OR: [
      { interactionType: { in: ASK_TYPES } },
      { responseRequired: true, interactionType: { notIn: RESPONSE_TYPES } },
    ],
  };

  const [
    attendedScoringRows,
    attendedRecent,
    attendedEarlier,
    attendedEver,
    activeGroups,
    ministryActivities,
    twoWayInteractions,
    replies,
    answeredAsks,
    servicesAttended,
    eventsAttended,
    lastAttended,
    lastInteraction,
    lastMemberActivity,
  ] = await Promise.all([
    prisma.attendance.findMany({
      where: present({ id: { in: context.services.map((s) => s.id) } }),
      select: { serviceId: true },
    }),
    prisma.attendance.count({
      where: present({ date: { gte: weeksStart(RULES.recentWeeks), lte: day } }),
    }),
    prisma.attendance.count({
      where: present({
        date: { gte: weeksStart(RULES.lapsedWeeks), lte: daysBefore(RULES.recentWeeks * 7) },
      }),
    }),
    prisma.attendance.count({ where: present({ date: { lte: day } }) }),
    prisma.groupMember.count({ where: { userId, isActive: true, group: { isActive: true } } }),
    prisma.memberActivity.count({
      where: {
        userId,
        activityType: { in: MINISTRY_ACTIVITIES },
        createdAt: { gte: monthsBefore(day, RULES.ministryMonths) },
      },
    }),
    prisma.memberInteraction.count({ where: { ...interactionWindow, ...asks } }),
    prisma.memberInteraction.count({
      where: { ...interactionWindow, interactionType: { in: RESPONSE_TYPES } },
    }),
    prisma.memberInteraction.count({
      where: {
        ...interactionWindow,
        AND: [asks, { OR: [{ responseReceived: true }, { responseTime: { not: null } }] }],
      },
    }),
    prisma.attendance.count({ where: present({ date: { gte: twelveMonths, lte: day } }) }),
    prisma.memberActivity.count({
      where: { userId, activityType: 'event_attendance', createdAt: { gte: twelveMonths } },
    }),
    prisma.attendance.findFirst({
      where: present({ date: { lte: day } }),
      orderBy: { service: { date: 'desc' } },
      select: { service: { select: { date: true } } },
    }),
    prisma.memberInteraction.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.memberActivity.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  // Scoring services count for the member when held on or after the day the account was created,
  // or when the member attended them (see the account-age rule at the top of this file).
  const attended = new Set(attendedScoringRows.map((a) => a.serviceId));
  const createdDay = today(user.createdAt).getTime();
  const servicesSince = (weeks: number) => {
    const start = weeksStart(weeks).getTime();
    const inWindow = context.services.filter((s) => s.date.getTime() >= start);
    return {
      held: inWindow.filter((s) => attended.has(s.id) || s.date.getTime() >= createdDay).length,
      attended: inWindow.filter((s) => attended.has(s.id)).length,
    };
  };
  const score = servicesSince(RULES.scoreWeeks);
  const recent = servicesSince(RULES.recentWeeks);

  const candidates = [
    lastAttended?.service.date,
    lastInteraction?.createdAt,
    lastMemberActivity?.createdAt,
    user.lastLoginAt,
  ].filter((d): d is Date => d instanceof Date);
  const lastActivity = candidates.length
    ? new Date(Math.max(...candidates.map((d) => d.getTime())))
    : null;

  return {
    facts: {
      isActive: user.isActive,
      hasLeaderRole: user.roles.some((r) => r.role.name === 'admin' || r.role.name === 'leader'),
      membershipDate: user.membershipDate,
      scoringServices: score.held,
      attendedScoring: score.attended,
      recentScoringServices: recent.held,
      recentAttendedScoring: recent.attended,
      lapsedWindowScoringServices: servicesSince(RULES.lapsedWeeks).held,
      attendedRecent,
      attendedEarlier,
      attendedEver,
      activeGroups,
      ministryActivities,
      twoWayInteractions,
      respondedInteractions: replies + answeredAsks,
    },
    lastActivity,
    servicesAttended,
    eventsAttended,
  };
}

export interface MemberEngagement extends EngagementComponents {
  membershipStage: MembershipStage;
  riskLevel: RiskLevel;
  lastActivity: Date | null;
  types: ServiceType[];
}

/**
 * A member's engagement computed now (nothing is stored). `types` is the scoring set of the
 * attendance rules. Throws Prisma P2025 (404) for an unknown member.
 */
export async function calculateMemberEngagement(
  userId: string,
  types: readonly ServiceType[] = DEFAULT_SCORING_SERVICE_TYPES,
  now = new Date(),
): Promise<MemberEngagement> {
  const { facts, lastActivity } = await gatherFacts(userId, await loadScoringContext(types, now));
  const membershipStage = determineStage(facts, now);
  return {
    ...scoreEngagement(facts),
    membershipStage,
    riskLevel: determineRisk(membershipStage, facts),
    lastActivity,
    types: [...types],
  };
}

/** The first day (UTC) of `now`'s month, as a `date` column value. */
export function snapshotMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Recalculates and stores a member's engagement row (default scoring set) and upserts the
 * snapshot of the current month. `context` (loadScoringContext with the default scoring set and
 * the same `now`) is read when not given. Throws Prisma P2025 (404) for an unknown member.
 */
export async function updateMemberEngagement(
  userId: string,
  now = new Date(),
  context?: ScoringContext,
): Promise<void> {
  const { facts, lastActivity, servicesAttended, eventsAttended } = await gatherFacts(
    userId,
    context ?? (await loadScoringContext(DEFAULT_SCORING_SERVICE_TYPES, now)),
  );
  const components = scoreEngagement(facts);
  const membershipStage = determineStage(facts, now);
  const riskLevel = determineRisk(membershipStage, facts);
  const row = {
    ...components,
    servicesAttended,
    eventsAttended,
    membershipStage,
    riskLevel,
    lastActivity,
    lastCalculated: now,
  };
  const snapshot = { ...components, membershipStage, riskLevel };
  const month = snapshotMonth(now);
  await prisma.$transaction([
    prisma.memberEngagement.upsert({
      where: { userId },
      update: row,
      create: { userId, ...row },
    }),
    prisma.engagementSnapshot.upsert({
      where: { userId_month: { userId, month } },
      update: snapshot,
      create: { userId, month, ...snapshot },
    }),
  ]);
}

const zeroed = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

/**
 * Member analytics for the dashboard, over active accounts and their stored engagement rows.
 */
export async function getMemberAnalytics(now = new Date()) {
  // New this month: accounts created since the first day of the current UTC month.
  const firstOfMonth = snapshotMonth(now);
  const activeAccount: Prisma.MemberEngagementWhereInput = { user: { isActive: true } };

  const [
    totalMembers,
    activeMembers,
    newMembersThisMonth,
    atRiskMembers,
    averages,
    topEngagedMembers,
    stageDistribution,
    riskDistribution,
  ] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.memberEngagement.count({
      where: {
        ...activeAccount,
        membershipStage: { in: ['active_member', 'core_member', 'leader'] },
      },
    }),
    prisma.user.count({ where: { isActive: true, createdAt: { gte: firstOfMonth } } }),
    // atRiskMembers: active accounts at high risk (stage at_risk or inactive).
    prisma.memberEngagement.count({ where: { ...activeAccount, riskLevel: 'high' } }),
    prisma.memberEngagement.aggregate({
      where: activeAccount,
      _avg: {
        engagementScore: true,
        attendanceScore: true,
        communityScore: true,
        communicationScore: true,
      },
    }),
    prisma.memberEngagement.findMany({
      where: activeAccount,
      take: 10,
      orderBy: [{ engagementScore: 'desc' }, { userId: 'asc' }],
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    }),
    prisma.memberEngagement.groupBy({
      by: ['membershipStage'],
      where: activeAccount,
      _count: { _all: true },
    }),
    prisma.memberEngagement.groupBy({
      by: ['riskLevel'],
      where: activeAccount,
      _count: { _all: true },
    }),
  ]);

  const membershipStageDistribution = zeroed(MEMBERSHIP_STAGES);
  for (const s of stageDistribution) membershipStageDistribution[s.membershipStage] = s._count._all;
  const riskLevelDistribution = zeroed(RISK_LEVELS);
  for (const r of riskDistribution) riskLevelDistribution[r.riskLevel] = r._count._all;
  const avg = (value: number | null) => Math.round(value ?? 0);

  return {
    totalMembers,
    activeMembers,
    newMembersThisMonth,
    atRiskMembers,
    averageEngagementScore: avg(averages._avg.engagementScore),
    averageScores: {
      engagementScore: avg(averages._avg.engagementScore),
      attendanceScore: avg(averages._avg.attendanceScore),
      communityScore: avg(averages._avg.communityScore),
      communicationScore: avg(averages._avg.communicationScore),
    },
    topEngagedMembers,
    membershipStageDistribution,
    riskLevelDistribution,
  };
}

/**
 * Record a member activity, then recalculate the member's engagement.
 */
export async function recordActivity(
  userId: string,
  body: z.output<typeof recordActivityInput>,
): Promise<void> {
  await prisma.memberActivity.create({
    data: {
      userId,
      activityType: body.activityType,
      description: body.description,
      metadata: jsonOrUndefined(body.metadata),
      points: body.points,
    },
  });
  await updateMemberEngagement(userId);
}

/**
 * Record a member interaction initiated by a staff member.
 */
export async function recordInteraction(
  userId: string,
  staffMemberId: string,
  body: z.output<typeof recordInteractionInput>,
): Promise<void> {
  await prisma.memberInteraction.create({
    data: {
      userId,
      interactionType: body.interactionType,
      channel: body.channel,
      subject: body.subject,
      content: body.content,
      staffMemberId,
      metadata: jsonOrUndefined(body.metadata),
      completedAt: new Date(),
    },
  });
}

/**
 * The member's engagement snapshots of the last `months` months (the current month included),
 * oldest first. Months without a refresh have no entry.
 */
export async function getEngagementTrends(
  userId: string,
  months: number,
  now = new Date(),
): Promise<EngagementTrend[]> {
  const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) throw new HttpError(404, 'User not found');
  const current = snapshotMonth(now);
  const from = new Date(
    Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - (months - 1), 1),
  );
  const snapshots = await prisma.engagementSnapshot.findMany({
    where: { userId, month: { gte: from, lte: current } },
    orderBy: { month: 'asc' },
  });
  return snapshots.map((s) => ({
    month: s.month.toISOString().slice(0, 7),
    engagementScore: s.engagementScore,
    attendanceScore: s.attendanceScore,
    communityScore: s.communityScore,
    communicationScore: s.communicationScore,
    membershipStage: s.membershipStage,
    riskLevel: s.riskLevel,
  }));
}
