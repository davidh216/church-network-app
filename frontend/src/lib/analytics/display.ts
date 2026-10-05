/** Colours and labels for the analytics dashboard. */

/** Score badge: 80+ green, 60+ blue, 40+ yellow, otherwise red. */
export function engagementScoreClass(score: number): string {
  if (score >= 80) return 'text-green-600 bg-green-100';
  if (score >= 60) return 'text-blue-600 bg-blue-100';
  if (score >= 40) return 'text-yellow-600 bg-yellow-100';
  return 'text-red-600 bg-red-100';
}

const STAGE_COLOURS: Record<string, string> = {
  leader: 'bg-purple-100 text-purple-800',
  core_member: 'bg-blue-100 text-blue-800',
  active_member: 'bg-green-100 text-green-800',
  new_member: 'bg-yellow-100 text-yellow-800',
  visitor: 'bg-gray-100 text-gray-800',
  at_risk: 'bg-orange-100 text-orange-800',
  inactive: 'bg-red-100 text-red-800',
};

export const stageColour = (stage: string): string =>
  STAGE_COLOURS[stage] ?? 'bg-gray-100 text-gray-800';

const RISK_COLOURS: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800',
};

export const riskColour = (level: string): string =>
  RISK_COLOURS[level] ?? 'bg-gray-100 text-gray-800';

/** "core_member" -> "Core Member". */
export function stageLabel(stage: string): string {
  return stage
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** "medium" -> "Medium Risk". */
export function riskLabel(level: string): string {
  return `${level.charAt(0).toUpperCase() + level.slice(1)} Risk`;
}
