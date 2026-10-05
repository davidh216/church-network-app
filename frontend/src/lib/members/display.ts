/** Display helpers shared by the member table, cards and profile. */

/** Up to the first letter of each word in a name, upper-cased ("Ada Lovelace" -> "AL"). */
export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

/** "core_member" -> "core member". */
export function formatStage(stage: string): string {
  return stage.replace(/_/g, ' ');
}

const STAGE_CLASSES: Record<string, string> = {
  leader: 'bg-purple-100 text-purple-800',
  core_member: 'bg-blue-100 text-blue-800',
  active_member: 'bg-green-100 text-green-800',
  new_member: 'bg-yellow-100 text-yellow-800',
  visitor: 'bg-gray-100 text-gray-800',
  at_risk: 'bg-orange-100 text-orange-800',
};

/** Badge colours for a membership stage; unknown stages (and "inactive") are red. */
export function stageClass(stage: string): string {
  return STAGE_CLASSES[stage] ?? 'bg-red-100 text-red-800';
}

/** Badge colours for an engagement score: 80+ green, 50+ yellow, otherwise red. */
export function engagementClass(score: number): string {
  if (score >= 80) return 'bg-green-100 text-green-800';
  if (score >= 50) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

/** Dot colour for a risk level: low green, medium yellow, anything else red. */
export function riskDotClass(risk: string): string {
  if (risk === 'low') return 'bg-green-400';
  if (risk === 'medium') return 'bg-yellow-400';
  return 'bg-red-400';
}
