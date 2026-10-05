import { z } from 'zod';
import {
  activityType,
  channel,
  interactionType,
  type MembershipStage,
  type RiskLevel,
  type ServiceType,
} from './enums.js';
import { boundedText, metadata } from './primitives.js';
import { DEFAULT_SCORING_SERVICE_TYPES, scoringTypes } from './services.js';

const POINTS_MESSAGE = 'Points must be a whole number from -1000 to 1000';

// POST /api/analytics/members/:id/activities (staff)
export const recordActivityInput = z.object({
  activityType,
  description: boundedText('Description', 1000).optional(),
  metadata,
  points: z
    .number({ error: POINTS_MESSAGE })
    .int(POINTS_MESSAGE)
    .min(-1000, POINTS_MESSAGE)
    .max(1000, POINTS_MESSAGE)
    .default(0),
});

// POST /api/analytics/members/:id/interactions (staff)
export const recordInteractionInput = z.object({
  interactionType,
  channel,
  subject: boundedText('Subject', 200).optional(),
  content: boundedText('Content', 10_000).optional(),
  metadata,
});

export type RecordActivityInput = z.input<typeof recordActivityInput>;
export type RecordInteractionInput = z.input<typeof recordInteractionInput>;

// Engagement (PHASE3_SPECS.md 1.5). Three components, each 0-100, and their weighted sum.
export const ENGAGEMENT_WEIGHTS = { attendance: 0.6, community: 0.2, communication: 0.2 } as const;
export const DEFAULT_TREND_MONTHS = 12;
export const MAX_TREND_MONTHS = 60;

const monthsParam = z.coerce
  .number({ error: 'Months must be a whole number' })
  .int('Months must be a whole number')
  .min(1, 'Months must be at least 1')
  .max(MAX_TREND_MONTHS, `Months must be at most ${MAX_TREND_MONTHS}`);

// Query string of GET /api/analytics/members/:id/engagement (staff): the service types the
// attendance score counts (default: the scoring set). Stored scores always use the default set.
export const engagementQuery = z.object({
  types: scoringTypes.optional().transform((types) => types ?? [...DEFAULT_SCORING_SERVICE_TYPES]),
});

// Query string of GET /api/analytics/members/:id/trends (staff): snapshots of the last `months`
// months, the current month included.
export const engagementTrendsQuery = z.object({
  months: monthsParam.default(DEFAULT_TREND_MONTHS),
});

export interface EngagementQueryParams {
  types?: ServiceType[];
}
export interface EngagementTrendsParams {
  months?: number;
}

export interface EngagementComponents {
  engagementScore: number;
  attendanceScore: number;
  communityScore: number;
  communicationScore: number;
}

/** GET /api/analytics/members/:id/engagement: computed now, not stored. */
export interface MemberEngagementResult extends EngagementComponents {
  membershipStage: MembershipStage;
  riskLevel: RiskLevel;
  /** ISO timestamp of the member's latest activity, or null when there is none. */
  lastActivity: string | null;
  /** The service types the attendance score counted. */
  types: ServiceType[];
}

/** One month of GET /api/analytics/members/:id/trends, oldest first. */
export interface EngagementTrend extends EngagementComponents {
  /** `YYYY-MM`. */
  month: string;
  membershipStage: MembershipStage;
  riskLevel: RiskLevel;
}

export type EngagementJobStatus = 'running' | 'completed' | 'failed';

/** GET /api/analytics/jobs/:id: a refresh-all job (in-process; kept until the API restarts). */
export interface EngagementJob {
  jobId: string;
  status: EngagementJobStatus;
  /** Members refreshed so far, failures included. */
  processed: number;
  /** Of those, members whose refresh failed (logged by the API). */
  failed: number;
  total: number;
  startedAt: string;
  finishedAt: string | null;
}
