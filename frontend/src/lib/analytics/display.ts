/** Colours for the analytics dashboard (stage and risk labels live in lib/members/display). */
import { ENGAGEMENT_WEIGHTS, type EngagementComponents } from '@embrace/shared';

/** Score badge: 80+ green, 60+ blue, 40+ yellow, otherwise red. */
export function engagementScoreClass(score: number): string {
  if (score >= 80) return 'text-green-800 bg-green-100';
  if (score >= 60) return 'text-blue-800 bg-blue-100';
  if (score >= 40) return 'text-yellow-800 bg-yellow-100';
  return 'text-red-800 bg-red-100';
}

/** The three engagement components a score is built from (PHASE3_SPECS.md 1.5 and 6.1). */
export type EngagementComponentKey = Exclude<keyof EngagementComponents, 'engagementScore'>;

/** A component's weight in the overall score, in whole percent (from the shared weights). */
const percent = (weight: number) => Math.round(weight * 100);

export interface EngagementComponent {
  key: EngagementComponentKey;
  label: string;
  /** Its weight in the overall score, in percent. */
  weight: number;
  /** What it measures, in one line. */
  help: string;
}

export const ENGAGEMENT_COMPONENTS: readonly EngagementComponent[] = [
  {
    key: 'attendanceScore',
    label: 'Attendance',
    weight: percent(ENGAGEMENT_WEIGHTS.attendance),
    help: 'Share of Sunday services attended in the last 12 weeks, counting only services since the account was created.',
  },
  {
    key: 'communityScore',
    label: 'Community',
    weight: percent(ENGAGEMENT_WEIGHTS.community),
    help: 'Active group memberships: none scores 0, one scores 60, two or more score 100.',
  },
  {
    key: 'communicationScore',
    label: 'Communication',
    weight: percent(ENGAGEMENT_WEIGHTS.communication),
    help: 'Responses over asks in the last 12 months, capped at 100; 100 when there were responses but no asks, 50 when there were neither.',
  },
];

/** How the overall engagement score is computed from the components. */
export const ENGAGEMENT_SCORE_HELP = `Overall score: ${percent(ENGAGEMENT_WEIGHTS.attendance)}% attendance, ${percent(ENGAGEMENT_WEIGHTS.community)}% community and ${percent(ENGAGEMENT_WEIGHTS.communication)}% communication, rounded.`;
