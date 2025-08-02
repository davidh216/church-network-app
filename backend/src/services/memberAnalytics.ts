import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface EngagementMetrics {
  attendanceScore: number;
  givingScore: number;
  volunteerScore: number;
  communityScore: number;
  communicationScore: number;
  overallScore: number;
}

interface MemberAnalytics {
  totalMembers: number;
  activeMembers: number;
  newMembersThisMonth: number;
  atRiskMembers: number;
  averageEngagementScore: number;
  topEngagedMembers: any[];
  membershipStageDistribution: Record<string, number>;
  riskLevelDistribution: Record<string, number>;
}

export class MemberAnalyticsService {
  
  /**
   * Calculate engagement score for a specific member
   */
  async calculateMemberEngagement(userId: string): Promise<EngagementMetrics> {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    
    // Get member data for calculations
    const member = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        attendances: {
          where: {
            createdAt: { gte: twelveMonthsAgo }
          }
        },
        activities: {
          where: {
            createdAt: { gte: twelveMonthsAgo }
          }
        },
        interactions: {
          where: {
            createdAt: { gte: twelveMonthsAgo }
          }
        },
        groupMembers: {
          where: {
            isActive: true
          }
        }
      }
    });

    if (!member) {
      throw new Error('Member not found');
    }

    // Calculate attendance score (0-100)
    const totalServices = await this.getTotalServicesInPeriod(twelveMonthsAgo, now);
    const memberAttendance = member.attendances.filter(a => a.present).length;
    const attendanceScore = totalServices > 0 ? Math.min((memberAttendance / totalServices) * 100, 100) : 0;

    // Calculate giving score (0-100) - based on consistency rather than amount
    const givingActivities = member.activities.filter(a => a.activityType === 'donation');
    const givingMonths = new Set(givingActivities.map(a => 
      `${a.createdAt.getFullYear()}-${a.createdAt.getMonth()}`
    )).size;
    const givingScore = Math.min((givingMonths / 12) * 100, 100);

    // Calculate volunteer score (0-100)
    const volunteerActivities = member.activities.filter(a => 
      a.activityType === 'volunteer' || a.activityType === 'ministry_participation'
    );
    const volunteerScore = Math.min((volunteerActivities.length / 12) * 100, 100);

    // Calculate community score (0-100) - based on group participation
    const activeGroups = member.groupMembers.length;
    const groupActivities = member.activities.filter(a => a.activityType === 'group_participation');
    const communityScore = Math.min(((activeGroups * 20) + (groupActivities.length * 2)), 100);

    // Calculate communication score (0-100) - based on email/sms engagement
    const communicationInteractions = member.interactions.filter(i => 
      i.interactionType.includes('email') || i.interactionType.includes('sms')
    );
    const responseRate = this.calculateResponseRate(communicationInteractions);
    const communicationScore = responseRate * 100;

    // Calculate overall engagement score (weighted average)
    const weights = {
      attendance: 0.3,
      giving: 0.2,
      volunteer: 0.2,
      community: 0.15,
      communication: 0.15
    };

    const overallScore = (
      attendanceScore * weights.attendance +
      givingScore * weights.giving +
      volunteerScore * weights.volunteer +
      communityScore * weights.community +
      communicationScore * weights.communication
    );

    return {
      attendanceScore: Math.round(attendanceScore),
      givingScore: Math.round(givingScore),
      volunteerScore: Math.round(volunteerScore),
      communityScore: Math.round(communityScore),
      communicationScore: Math.round(communicationScore),
      overallScore: Math.round(overallScore)
    };
  }

  /**
   * Update engagement data for a member
   */
  async updateMemberEngagement(userId: string): Promise<void> {
    const metrics = await this.calculateMemberEngagement(userId);
    const now = new Date();
    
    // Determine membership stage based on engagement and tenure
    const membershipStage = await this.determineMembershipStage(userId, metrics.overallScore);
    
    // Determine risk level based on recent activity
    const riskLevel = await this.determineRiskLevel(userId, metrics.overallScore);
    
    // Count activities in the past 12 months
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const activityCounts = await this.getActivityCounts(userId, twelveMonthsAgo);

    await prisma.memberEngagement.upsert({
      where: { userId },
      update: {
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
        lastActivity: await this.getLastActivityDate(userId)
      },
      create: {
        userId,
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
        lastActivity: await this.getLastActivityDate(userId)
      }
    });
  }

  /**
   * Get comprehensive member analytics for dashboard
   */
  async getMemberAnalytics(): Promise<MemberAnalytics> {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get total member counts
    const totalMembers = await prisma.user.count({
      where: { isActive: true }
    });

    const activeMembers = await prisma.memberEngagement.count({
      where: {
        membershipStage: {
          in: ['active_member', 'core_member', 'leader']
        }
      }
    });

    const newMembersThisMonth = await prisma.user.count({
      where: {
        isActive: true,
        createdAt: { gte: firstOfMonth }
      }
    });

    const atRiskMembers = await prisma.memberEngagement.count({
      where: {
        riskLevel: { in: ['medium', 'high'] }
      }
    });

    // Calculate average engagement score
    const engagementAgg = await prisma.memberEngagement.aggregate({
      _avg: {
        engagementScore: true
      }
    });

    const averageEngagementScore = engagementAgg._avg.engagementScore || 0;

    // Get top engaged members
    const topEngagedMembers = await prisma.memberEngagement.findMany({
      take: 10,
      orderBy: { engagementScore: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        }
      }
    });

    // Get membership stage distribution
    const stageDistribution = await prisma.memberEngagement.groupBy({
      by: ['membershipStage'],
      _count: {
        membershipStage: true
      }
    });

    const membershipStageDistribution = stageDistribution.reduce((acc, stage) => {
      acc[stage.membershipStage] = stage._count.membershipStage;
      return acc;
    }, {} as Record<string, number>);

    // Get risk level distribution
    const riskDistribution = await prisma.memberEngagement.groupBy({
      by: ['riskLevel'],
      _count: {
        riskLevel: true
      }
    });

    const riskLevelDistribution = riskDistribution.reduce((acc, risk) => {
      acc[risk.riskLevel] = risk._count.riskLevel;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalMembers,
      activeMembers,
      newMembersThisMonth,
      atRiskMembers,
      averageEngagementScore: Math.round(averageEngagementScore),
      topEngagedMembers,
      membershipStageDistribution,
      riskLevelDistribution
    };
  }

  /**
   * Record a member activity
   */
  async recordActivity(
    userId: string, 
    activityType: string, 
    description?: string, 
    metadata?: any,
    points = 0
  ): Promise<void> {
    await prisma.memberActivity.create({
      data: {
        userId,
        activityType,
        description,
        metadata: metadata ? JSON.stringify(metadata) : null,
        points
      }
    });

    // Update engagement score after recording activity
    await this.updateMemberEngagement(userId);
  }

  /**
   * Add a member interaction
   */
  async recordInteraction(
    userId: string,
    interactionType: string,
    channel: string,
    subject?: string,
    content?: string,
    staffMemberId?: string,
    metadata?: any
  ): Promise<void> {
    await prisma.memberInteraction.create({
      data: {
        userId,
        interactionType,
        channel,
        subject,
        content,
        staffMemberId,
        metadata: metadata ? JSON.stringify(metadata) : null,
        completedAt: new Date()
      }
    });
  }

  /**
   * Get member engagement trends over time
   */
  async getEngagementTrends(userId: string, months = 12): Promise<any[]> {
    const endDate = new Date();
    const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - months, 1);

    // This would typically involve more complex aggregation
    // For now, return basic monthly activity counts
    const activities = await prisma.memberActivity.findMany({
      where: {
        userId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Group activities by month
    const monthlyData = activities.reduce((acc, activity) => {
      const monthKey = `${activity.createdAt.getFullYear()}-${String(activity.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (!acc[monthKey]) {
        acc[monthKey] = { month: monthKey, activities: 0, points: 0 };
      }
      acc[monthKey].activities++;
      acc[monthKey].points += activity.points;
      return acc;
    }, {} as Record<string, any>);

    return Object.values(monthlyData);
  }

  // Private helper methods

  private async getTotalServicesInPeriod(startDate: Date, endDate: Date): Promise<number> {
    // This would typically be based on a services/events table
    // For now, assume 4-5 services per month
    const months = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
    return months * 4; // Approximate weekly services
  }

  private calculateResponseRate(interactions: any[]): number {
    if (interactions.length === 0) return 0;
    
    const responses = interactions.filter(i => 
      i.interactionType.includes('opened') || 
      i.interactionType.includes('replied') ||
      i.responseTime !== null
    ).length;
    
    return responses / interactions.length;
  }

  private async determineMembershipStage(userId: string, engagementScore: number): Promise<string> {
    const member = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        createdAt: true, 
        membershipDate: true,
        roles: {
          include: { role: true }
        }
      }
    });

    if (!member) return 'visitor';

    const daysSinceJoining = Math.floor(
      (new Date().getTime() - (member.membershipDate || member.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check if user has leadership roles
    const hasLeadershipRole = member.roles.some(ur => 
      ['admin', 'leader'].includes(ur.role.name)
    );

    if (hasLeadershipRole) return 'leader';
    if (engagementScore >= 80 && daysSinceJoining > 180) return 'core_member';
    if (engagementScore >= 60 && daysSinceJoining > 90) return 'active_member';
    if (daysSinceJoining > 30) return 'new_member';
    
    return 'visitor';
  }

  private async determineRiskLevel(userId: string, engagementScore: number): Promise<string> {
    const lastActivity = await this.getLastActivityDate(userId);
    const daysSinceActivity = lastActivity 
      ? Math.floor((new Date().getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (engagementScore < 30 || daysSinceActivity > 60) return 'high';
    if (engagementScore < 50 || daysSinceActivity > 30) return 'medium';
    
    return 'low';
  }

  private async getLastActivityDate(userId: string): Promise<Date | null> {
    const lastActivity = await prisma.memberActivity.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    return lastActivity?.createdAt || null;
  }

  private async getActivityCounts(userId: string, startDate: Date): Promise<any> {
    const activities = await prisma.memberActivity.findMany({
      where: {
        userId,
        createdAt: { gte: startDate }
      }
    });

    const attendances = await prisma.attendance.count({
      where: {
        userId,
        present: true,
        createdAt: { gte: startDate }
      }
    });

    return {
      servicesAttended: attendances,
      eventsAttended: activities.filter(a => a.activityType === 'event_attendance').length,
      volunteerHours: activities
        .filter(a => a.activityType === 'volunteer')
        .reduce((sum, a) => {
          try {
            const metadata = JSON.parse(a.metadata || '{}');
            return sum + (metadata.hours || 1);
          } catch {
            return sum + 1;
          }
        }, 0),
      donationCount: activities.filter(a => a.activityType === 'donation').length,
      groupMeetings: activities.filter(a => a.activityType === 'group_participation').length
    };
  }
}

export const memberAnalyticsService = new MemberAnalyticsService();