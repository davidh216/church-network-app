import type { MemberInteraction, Prisma } from '@prisma/client';
import type { z } from 'zod';
import type {
  ActivityType,
  MembershipStage,
  recordActivityInput,
  recordInteractionInput,
  RiskLevel,
} from '@embrace/shared';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

// Request metadata (a JSON object validated by the shared schema) as a Prisma JSON input.
const jsonOrUndefined = (value: Record<string, unknown> | undefined) =>
  value as Prisma.InputJsonObject | undefined;

export interface EngagementMetrics {
  attendanceScore: number;
  givingScore: number;
  volunteerScore: number;
  communityScore: number;
  communicationScore: number;
  overallScore: number;
}

export interface MonthlyTrend {
  month: string;
  activities: number;
  points: number;
}

const DAY_MS = 1000 * 60 * 60 * 24;

const twelveMonthsBefore = (date: Date) =>
  new Date(date.getFullYear() - 1, date.getMonth(), date.getDate());

/**
 * Calculate engagement score for a specific member. Throws Prisma P2025 (404) for an unknown member.
 */
export async function calculateMemberEngagement(userId: string): Promise<EngagementMetrics> {
  const now = new Date();
  const twelveMonthsAgo = twelveMonthsBefore(now);

  const member = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      attendances: { where: { createdAt: { gte: twelveMonthsAgo } } },
      activities: { where: { createdAt: { gte: twelveMonthsAgo } } },
      interactions: { where: { createdAt: { gte: twelveMonthsAgo } } },
      groupMembers: { where: { isActive: true } },
    },
  });

  // Attendance (0-100)
  const totalServices = totalServicesInPeriod(twelveMonthsAgo, now);
  const memberAttendance = member.attendances.filter((a) => a.present).length;
  const attendanceScore =
    totalServices > 0 ? Math.min((memberAttendance / totalServices) * 100, 100) : 0;

  // Giving (0-100): consistency (months with a donation), not amount
  const givingActivities = member.activities.filter((a) => a.activityType === 'donation');
  const givingMonths = new Set(
    givingActivities.map((a) => `${a.createdAt.getFullYear()}-${a.createdAt.getMonth()}`),
  ).size;
  const givingScore = Math.min((givingMonths / 12) * 100, 100);

  // Volunteering (0-100)
  const volunteerActivities = member.activities.filter(
    (a) => a.activityType === 'volunteer' || a.activityType === 'ministry_participation',
  );
  const volunteerScore = Math.min((volunteerActivities.length / 12) * 100, 100);

  // Community (0-100): group participation. The legacy 'group_participation' activity type is not
  // in the ActivityType enum (the D2 migration mapped it to 'other'), so only memberships count.
  const activeGroups = member.groupMembers.length;
  const communityScore = Math.min(activeGroups * 20, 100);

  // Communication (0-100): email/sms engagement
  const communicationInteractions = member.interactions.filter(
    (i) => i.interactionType.includes('email') || i.interactionType.includes('sms'),
  );
  const communicationScore = responseRate(communicationInteractions) * 100;

  const overallScore =
    attendanceScore * 0.3 +
    givingScore * 0.2 +
    volunteerScore * 0.2 +
    communityScore * 0.15 +
    communicationScore * 0.15;

  return {
    attendanceScore: Math.round(attendanceScore),
    givingScore: Math.round(givingScore),
    volunteerScore: Math.round(volunteerScore),
    communityScore: Math.round(communityScore),
    communicationScore: Math.round(communicationScore),
    overallScore: Math.round(overallScore),
  };
}

/**
 * Recalculate and store the engagement row for a member.
 */
export async function updateMemberEngagement(userId: string): Promise<void> {
  const metrics = await calculateMemberEngagement(userId);
  const now = new Date();
  const membershipStage = await determineMembershipStage(userId, metrics.overallScore);
  const lastActivity = await lastActivityDate(userId);
  const riskLevel = determineRiskLevel(lastActivity, metrics.overallScore);
  const activityCounts = await countActivities(userId, twelveMonthsBefore(now));

  const data = {
    engagementScore: metrics.overallScore,
    lastCalculated: now,
    attendanceScore: metrics.attendanceScore,
    givingScore: metrics.givingScore,
    volunteerScore: metrics.volunteerScore,
    communityScore: metrics.communityScore,
    communicationScore: metrics.communicationScore,
    ...activityCounts,
    membershipStage,
    riskLevel,
    lastActivity,
  };
  await prisma.memberEngagement.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}

/**
 * Recalculate engagement for every active member. Failures are logged and skipped.
 */
export async function refreshAllEngagement(): Promise<{ updated: number; total: number }> {
  const members = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } });
  let updated = 0;
  for (const member of members) {
    try {
      await updateMemberEngagement(member.id);
      updated++;
    } catch (err) {
      logger.error({ err, userId: member.id }, 'engagement refresh failed');
    }
  }
  return { updated, total: members.length };
}

/**
 * Member analytics for the dashboard.
 */
export async function getMemberAnalytics() {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const totalMembers = await prisma.user.count({ where: { isActive: true } });
  const activeMembers = await prisma.memberEngagement.count({
    where: { membershipStage: { in: ['active_member', 'core_member', 'leader'] } },
  });
  const newMembersThisMonth = await prisma.user.count({
    where: { isActive: true, createdAt: { gte: firstOfMonth } },
  });
  const atRiskMembers = await prisma.memberEngagement.count({
    where: { riskLevel: { in: ['medium', 'high'] } },
  });
  const engagementAgg = await prisma.memberEngagement.aggregate({
    _avg: { engagementScore: true },
  });

  const topEngagedMembers = await prisma.memberEngagement.findMany({
    take: 10,
    orderBy: { engagementScore: 'desc' },
    include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
  });

  const stageDistribution = await prisma.memberEngagement.groupBy({
    by: ['membershipStage'],
    _count: { membershipStage: true },
  });
  const riskDistribution = await prisma.memberEngagement.groupBy({
    by: ['riskLevel'],
    _count: { riskLevel: true },
  });

  return {
    totalMembers,
    activeMembers,
    newMembersThisMonth,
    atRiskMembers,
    averageEngagementScore: Math.round(engagementAgg._avg.engagementScore ?? 0),
    topEngagedMembers,
    membershipStageDistribution: Object.fromEntries(
      stageDistribution.map((s) => [s.membershipStage, s._count.membershipStage]),
    ) as Partial<Record<MembershipStage, number>>,
    riskLevelDistribution: Object.fromEntries(
      riskDistribution.map((r) => [r.riskLevel, r._count.riskLevel]),
    ) as Partial<Record<RiskLevel, number>>,
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
 * Monthly activity counts and points for a member over the last `months` months.
 */
export async function getEngagementTrends(userId: string, months: number): Promise<MonthlyTrend[]> {
  const endDate = new Date();
  const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - months, 1);
  const activities = await prisma.memberActivity.findMany({
    where: { userId, createdAt: { gte: startDate, lte: endDate } },
    orderBy: { createdAt: 'asc' },
  });

  const monthly = new Map<string, MonthlyTrend>();
  for (const activity of activities) {
    const month = `${activity.createdAt.getFullYear()}-${String(activity.createdAt.getMonth() + 1).padStart(2, '0')}`;
    const entry = monthly.get(month) ?? { month, activities: 0, points: 0 };
    entry.activities++;
    entry.points += activity.points;
    monthly.set(month, entry);
  }
  return [...monthly.values()];
}

// Helpers

// There is no services/events table yet: assume about four services a month.
function totalServicesInPeriod(startDate: Date, endDate: Date): number {
  const months = Math.ceil((endDate.getTime() - startDate.getTime()) / (DAY_MS * 30));
  return months * 4;
}

function responseRate(interactions: MemberInteraction[]): number {
  if (interactions.length === 0) return 0;
  const responses = interactions.filter(
    (i) =>
      i.interactionType.includes('opened') ||
      i.interactionType.includes('replied') ||
      i.responseTime !== null,
  ).length;
  return responses / interactions.length;
}

async function determineMembershipStage(
  userId: string,
  engagementScore: number,
): Promise<MembershipStage> {
  const member = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, membershipDate: true, roles: { include: { role: true } } },
  });
  if (!member) return 'visitor';

  const daysSinceJoining = Math.floor(
    (Date.now() - (member.membershipDate ?? member.createdAt).getTime()) / DAY_MS,
  );
  const hasLeadershipRole = member.roles.some((ur) => ['admin', 'leader'].includes(ur.role.name));

  if (hasLeadershipRole) return 'leader';
  if (engagementScore >= 80 && daysSinceJoining > 180) return 'core_member';
  if (engagementScore >= 60 && daysSinceJoining > 90) return 'active_member';
  if (daysSinceJoining > 30) return 'new_member';
  return 'visitor';
}

function determineRiskLevel(lastActivity: Date | null, engagementScore: number): RiskLevel {
  const daysSinceActivity = lastActivity
    ? Math.floor((Date.now() - lastActivity.getTime()) / DAY_MS)
    : 999;
  if (engagementScore < 30 || daysSinceActivity > 60) return 'high';
  if (engagementScore < 50 || daysSinceActivity > 30) return 'medium';
  return 'low';
}

async function lastActivityDate(userId: string): Promise<Date | null> {
  const lastActivity = await prisma.memberActivity.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return lastActivity?.createdAt ?? null;
}

// Hours recorded in a volunteer activity's metadata; one hour when absent or unreadable.
function volunteerHours(metadata: Prisma.JsonValue): number {
  const hours =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata.hours
      : undefined;
  return typeof hours === 'number' && hours > 0 ? hours : 1;
}

async function countActivities(userId: string, startDate: Date) {
  const activities = await prisma.memberActivity.findMany({
    where: { userId, createdAt: { gte: startDate } },
  });
  const servicesAttended = await prisma.attendance.count({
    where: { userId, present: true, createdAt: { gte: startDate } },
  });
  const ofType = (type: ActivityType) => activities.filter((a) => a.activityType === type);

  return {
    servicesAttended,
    eventsAttended: ofType('event_attendance').length,
    volunteerHours: ofType('volunteer').reduce((sum, a) => sum + volunteerHours(a.metadata), 0),
    donationCount: ofType('donation').length,
    // No activity type records group meetings since the enum migration (see communityScore).
    groupMeetings: 0,
  };
}
